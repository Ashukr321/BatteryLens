"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Activity, BatteryCharging, Download, FileDown, HeartPulse, Languages, LayoutDashboard, Moon, Palette, RefreshCcw, Settings, Sparkles, Sun, Tag } from "lucide-react";
import { setLang, useLang, useT, type Lang } from "@/lib/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/usage/", label: "Usage", icon: Activity },
  { href: "/health/", label: "Health", icon: HeartPulse },
  { href: "/cycles/", label: "Cycles", icon: RefreshCcw },
  { href: "/settings/", label: "Settings", icon: Settings },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "night-owl", label: "Night Owl", icon: Sparkles },
  { value: "system", label: "System", icon: Palette },
];

const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

/** Downloads the server-rendered PDF; falls back to the print dialog when no headless browser is available. */
async function exportPdf(t: ReturnType<typeof useT>, router: ReturnType<typeof useRouter>) {
  const id = toast.loading(t("Building PDF…"));
  try {
    const res = await fetch("/api/report.pdf");
    if (!res.ok) throw new Error(res.statusText);
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href: url, download: "batterylens-report.pdf" }).click();
    URL.revokeObjectURL(url);
    toast.success(t("PDF downloaded."), { id });
  } catch {
    toast.dismiss(id);
    router.push("/report/?print=1");
  }
}

/** Chrome/Edge's install prompt, kept so the sidebar can offer "Install app". Not in TS's DOM lib. */
type InstallPrompt = Event & { prompt: () => Promise<void> };

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href.replace(/\/$/, "")));

export function AppSidebar() {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const t = useT();
  const router = useRouter();
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => (e.preventDefault(), setInstall(e as InstallPrompt));
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="BatteryLens" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[var(--batt)] text-white">
                <BatteryCharging className="size-4" />
              </div>
              <div className="grid leading-tight">
                <span className="font-semibold">BatteryLens</span>
                <span className="text-xs text-muted-foreground">{t("100% local")}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("Dashboard")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={isActive(pathname, href)} tooltip={t(label)} render={<Link href={href} />} onClick={() => setOpenMobile(false)}>
                    <Icon />
                    <span>{t(label)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton tooltip={t("Theme")} />}>
                <Palette />
                <span>{t("Theme")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                    <Icon /> {t(label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton tooltip={t("Language")} />}>
                <Languages />
                <span>{LANGS.find((l) => l.value === lang)!.label}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end">
                {LANGS.map(({ value, label }) => (
                  <DropdownMenuItem key={value} lang={value} onClick={() => setLang(value)}>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* Server renders /report/ with headless Chrome/Edge; without one, the report page opens the print dialog. */}
            <SidebarMenuButton tooltip={t("Export PDF")} onClick={() => exportPdf(t, router)}>
              <FileDown />
              <span>{t("Export PDF")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {install && (
            <SidebarMenuItem>
              {/* An install prompt can be used only once. */}
              <SidebarMenuButton tooltip={t("Install app")} onClick={() => install.prompt().finally(() => setInstall(null))}>
                <Download />
                <span>{t("Install app")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={`Version ${process.env.NEXT_PUBLIC_VERSION}`} className="text-xs text-muted-foreground">
              <Tag />
              <span>batterylens v{process.env.NEXT_PUBLIC_VERSION}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Top bar of the content area: collapse toggle + current page name. */
export function PageBar() {
  const pathname = usePathname();
  const t = useT();
  const page = t(NAV.find((n) => isActive(pathname, n.href))?.label ?? "Report");
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur print:hidden">
      <SidebarTrigger className="-ml-1" />
      <span className="text-sm font-medium">{page}</span>
    </header>
  );
}
