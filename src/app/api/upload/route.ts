import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import type { UserRole } from "@/types";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3 Configuration (from environment variables)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";

// Allowed file types for lesson content
const ALLOWED_CONTENT_TYPES = {
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  PDF: ["application/pdf"],
  // TEXT lessons don't upload files
};

const MAX_FILE_SIZE = {
  VIDEO: 2 * 1024 * 1024 * 1024, // 2GB
  PDF: 100 * 1024 * 1024,        // 100MB
};

/**
 * POST /api/upload - Generate S3 presigned URL for file upload
 *
 * Request body:
 * - fileType: "VIDEO" | "PDF"
 * - fileName: string (original filename)
 * - contentType: string (MIME type)
 * - fileSize: number (in bytes)
 *
 * Returns presigned URL and key for direct S3 upload
 *
 * NOTE: This is a TEACHER-only endpoint.
 *
 * SECURITY NOTE (RESIDUAL RISK - documented for future enhancement):
 * The presigned URL generation currently validates user role (TEACHER) but does NOT
 * validate that the uploaded file is actually associated with a lesson owned by the
 * requesting teacher. A malicious teacher could potentially:
 * 1. Generate a presigned URL for lesson content
 * 2. Use that URL to upload files to other locations (if they can guess the key format)
 * 2. Upload files that bypass the intended lesson association
 *
 * Current mitigation: Files are uploaded to a predictable path structure
 * (uploads/{userId}/{timestamp}-{filename}) which ties uploads to the requesting user.
 *
 * Recommended enhancement: Implement file ownership validation by:
 * 1. Storing pending upload metadata (lessonId, teacherId) before presigned URL generation
 * 2. Verifying the upload matches the metadata on completion
 * 3. Only then updating lesson.contentUrl
 *
 * This enhancement is tracked for the next sprint as it requires additional workflow changes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Authorization: Only TEACHER can upload lesson content
    if (userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: Only teachers can upload lesson content" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { fileType, fileName, contentType, fileSize } = body;

    // Validation
    if (!fileType || !["VIDEO", "PDF"].includes(fileType)) {
      return NextResponse.json(
        { data: null, error: "fileType must be VIDEO or PDF" },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { data: null, error: "fileName is required" },
        { status: 400 }
      );
    }

    if (!contentType || typeof contentType !== "string") {
      return NextResponse.json(
        { data: null, error: "contentType is required" },
        { status: 400 }
      );
    }

    // Validate content type
    const allowedTypes = ALLOWED_CONTENT_TYPES[fileType as keyof typeof ALLOWED_CONTENT_TYPES];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { data: null, error: `Invalid contentType for ${fileType}. Allowed: ${allowedTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = MAX_FILE_SIZE[fileType as keyof typeof MAX_FILE_SIZE];
    if (fileSize && fileSize > maxSize) {
      return NextResponse.json(
        { data: null, error: `File size exceeds maximum of ${maxSize} bytes for ${fileType}` },
        { status: 400 }
      );
    }

    if (!S3_BUCKET_NAME) {
      return NextResponse.json(
        { data: null, error: "S3 bucket not configured" },
        { status: 500 }
      );
    }

    // Generate unique key for S3
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${userId}/${timestamp}-${safeFileName}`;

    // Create S3 command
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
      // Metadata for tracking
      Metadata: {
        "uploaded-by": userId,
        "file-type": fileType,
      },
    });

    // Generate presigned URL (valid for 15 minutes)
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // Construct the final URL that will be stored in the database
    const fileUrl = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

    return NextResponse.json({
      data: {
        presignedUrl,
        fileUrl,
        key,
        expiresIn: 900,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { data: null, error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/upload/complete - Mark upload as complete and update lesson (optional)
 *
 * This endpoint can be called after successful S3 upload to trigger any
 * post-upload processing (e.g., thumbnail generation, video transcoding notifications).
 *
 * For MVP, lesson.contentUrl is updated directly by the client after successful upload.
 */
export async function POST_complete(request: NextRequest) {
  // Placeholder for future enhancement
  return NextResponse.json({ data: { success: true }, error: null });
}
