import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Set new password · AllYono" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-sm pt-8">
      <ResetPasswordForm />
    </div>
  );
}
