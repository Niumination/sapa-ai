// ─── Login Page Layout — No sidebar, no auth check ───

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
