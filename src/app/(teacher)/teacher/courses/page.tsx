import RoleBadge from "@/components/shared/RoleBadge";

export default function TeacherCoursesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">My Courses</h1>
        <RoleBadge role="TEACHER" />
      </div>
      <p className="mt-2 text-muted-foreground">Manage your courses here.</p>
    </div>
  );
}
