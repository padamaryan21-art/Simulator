import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Set new password · LakiPH Simulation" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-sm pt-8">
      <ResetPasswordForm />
    </div>
  );
}
