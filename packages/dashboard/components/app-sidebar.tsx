"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, BatteryCharging, FileDown, HeartPulse, LayoutDashboard, Moon, Palette, RefreshCcw, Settings, Sparkles, Sun, Tag } from "lucide-react";
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

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href.replace(/\/$/, "")));

export function AppSidebar() {
  const pathname = usePathname();
  const { setTheme } = useTheme();

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
                <span className="text-xs text-muted-foreground">100% local</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={isActive(pathname, href)} tooltip={label} render={<Link href={href} />}>
                    <Icon />
                    <span>{label}</span>
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
              <DropdownMenuTrigger render={<SidebarMenuButton tooltip="Theme" />}>
                <Palette />
                <span>Theme</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                    <Icon /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* The report page lays out every section and opens the print dialog ("Save as PDF"). */}
            <SidebarMenuButton tooltip="Export PDF" render={<a href="/report/?print=1" />}>
              <FileDown />
              <span>Export PDF</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
  const page = NAV.find((n) => isActive(pathname, n.href))?.label ?? "Report";
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur print:hidden">
      <SidebarTrigger className="-ml-1" />
      <span className="text-sm font-medium">{page}</span>
    </header>
  );
}
