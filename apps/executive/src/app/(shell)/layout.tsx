import { AppHeader } from "@/components/AppHeader";
import { SubNav } from "@/components/SubNav";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <SubNav />
      <main className="p-4 pb-20">{children}</main>
    </>
  );
}
