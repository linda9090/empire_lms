import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        role: {
          teacher: "var(--role-teacher)",
          "teacher-foreground": "var(--role-teacher-foreground)",
          student: "var(--role-student)",
          "student-foreground": "var(--role-student-foreground)",
          guardian: "var(--role-guardian)",
          "guardian-foreground": "var(--role-guardian-foreground)",
          admin: "var(--role-admin)",
          "admin-foreground": "var(--role-admin-foreground)",
        },
      },
    },
  },
};

export default config;
