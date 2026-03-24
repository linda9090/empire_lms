# Smoke Test Script - Issue #5

This document outlines the manual smoke test procedure for verifying the Course CRUD and Enrollment functionality.

## Prerequisites

1. Database is running and migrations applied
2. Dev server running: `npm run dev`
3. Test users created (TEACHER and STUDENT roles)

## Test Scenario: Teacher Creates Course → Student Enrolls

### Step 1: Setup Test Users

```bash
# Create test users via API or directly in DB
# TEACHER: teacher@example.com
# STUDENT: student@example.com
```

### Step 2: Teacher Login & Create Course

```bash
# Login as TEACHER
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }' \
  -c cookies.txt

# Create a course
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Introduction to LMS",
    "description": "Learn how to use the platform",
    "isPublished": true
  }'

# Expected: 201 Created with course data
# Response includes: { data: { id, title, description, ... }, error: null }
```

### Step 3: List Courses (Anonymous)

```bash
# Get all published courses
curl http://localhost:3000/api/courses?published=true

# Expected: 200 OK with array of courses
# Should include the course created in Step 2
```

### Step 4: Student Login & Enroll

```bash
# Login as STUDENT
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123"
  }' \
  -c student_cookies.txt

# Enroll in the course
curl -X POST http://localhost:3000/api/enrollments \
  -H "Content-Type: application/json" \
  -b student_cookies.txt \
  -d '{
    "courseId": "<COURSE_ID_FROM_STEP_2>"
  }'

# Expected: 201 Created with enrollment data
```

### Step 5: Verify Enrollment

```bash
# Get student's enrollments
curl http://localhost:3000/api/enrollments \
  -b student_cookies.txt

# Expected: 200 OK with array containing the new enrollment
```

### Step 6: Attempt Duplicate Enrollment

```bash
# Try enrolling again
curl -X POST http://localhost:3000/api/enrollments \
  -H "Content-Type: application/json" \
  -b student_cookies.txt \
  -d '{
    "courseId": "<COURSE_ID_FROM_STEP_2>"
  }'

# Expected: 409 Conflict with error "Already enrolled in this course"
```

## Permission Separation Tests

### Test: Student Cannot Create Course

```bash
# As STUDENT, try to create a course
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -b student_cookies.txt \
  -d '{
    "title": "Unauthorized Course"
  }'

# Expected: 403 Forbidden
# Response: { data: null, error: "Forbidden: Only teachers and admins can create courses" }
```

### Test: Student Cannot Update Course

```bash
# As STUDENT, try to update a course
curl -X PUT http://localhost:3000/api/courses/<COURSE_ID> \
  -H "Content-Type: application/json" \
  -b student_cookies.txt \
  -d '{
    "title": "Hacked Title"
  }'

# Expected: 403 Forbidden
```

### Test: Student Cannot Delete Course

```bash
# As STUDENT, try to delete a course
curl -X DELETE http://localhost:3000/api/courses/<COURSE_ID> \
  -b student_cookies.txt

# Expected: 403 Forbidden
```

### Test: Teacher Cannot Enroll

```bash
# As TEACHER, try to enroll
curl -X POST http://localhost:3000/api/enrollments \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "courseId": "<COURSE_ID>"
  }'

# Expected: 403 Forbidden
# Response: { data: null, error: "Forbidden: Only students and admins can enroll..." }
```

### Test: Unauthenticated Requests

```bash
# Try to create course without auth
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -d '{"title": "No Auth Course"}'

# Expected: 401 Unauthorized

# Try to enroll without auth
curl -X POST http://localhost:3000/api/enrollments \
  -H "Content-Type: application/json" \
  -d '{"courseId": "<COURSE_ID>"}'

# Expected: 401 Unauthorized
```

## Success Criteria

- [ ] All API endpoints return expected status codes
- [ ] Teacher can create/update/delete courses
- [ ] Student can enroll and view enrollments
- [ ] Student cannot create/update/delete courses
- [ ] Teacher cannot enroll in courses
- [ ] Unauthenticated requests return 401
- [ ] Duplicate enrollments return 409
- [ ] Non-existent resources return 404
