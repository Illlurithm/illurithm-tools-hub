import { Film, FileText, Sparkles, type LucideIcon } from "lucide-react";

import { sections, type Tool } from "./tools-data";

const toolsOf = (id: string): Tool[] => sections.find((s) => s.id === id)?.tools ?? [];

export type Domain = {
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  tools: Tool[];
};

/** Every tool in the studio, grouped into the three brand domains. */
export const domains: Domain[] = [
  {
    id: "motion",
    name: "Motion",
    tagline: "Video & audio craft",
    icon: Film,
    tools: [...toolsOf("video"), ...toolsOf("audio")],
  },
  {
    id: "documents",
    name: "Documents",
    tagline: "PDF & conversion",
    icon: FileText,
    tools: [...toolsOf("pdf"), ...toolsOf("converters")],
  },
  {
    id: "visuals",
    name: "Visuals",
    tagline: "Photo & design",
    icon: Sparkles,
    tools: [...toolsOf("photo"), ...toolsOf("design")],
  },
];
