import RoleBadge from "@/components/shared/RoleBadge";

export default function StudentCoursesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Available Courses</h1>
        <RoleBadge role="STUDENT" />
      </div>
      <p className="mt-2 text-muted-foreground">Browse and enroll in courses.</p>
    </div>
  );
}
