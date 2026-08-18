import {
  Film, Music4, FileText, Repeat, Image as ImageIcon, Shapes,
  Share2, Briefcase, BookOpen, Printer, GraduationCap, Shirt, PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";

import { converterExtraGroups, converterExtraTools } from "./converter-tools";


export type Tool = { name: string };
export type Group = { label: string; tools: Tool[] };
export type Section = {
  id: string;
  label: string;
  icon: LucideIcon;
  total: number;
  tools: Tool[];
  groups?: Group[];
};

const t = (names: string[]): Tool[] => names.map((name) => ({ name }));

const video = t([
  "Add Audio to Video", "Add Image to Video", "Add Text to Video", "Beat Sync",
  "Change Video Speed", "Change Video Volume", "Crop Video", "Flip Video", "Loop Video",
  "Magic Switch", "Merge Videos", "Remove Logo from Video", "Resize Video", "Rotate Video",
  "Screen Recorder", "Stabilize Video", "Video Editor", "Video Recorder", "Video Trimmer",
  "Facebook Video", "LinkedIn Video Ad", "Mobile Video", "Pinterest Video Pin",
  "Slideshow Video", "Video Template", "Video Message", "YouTube Video", "YouTube Video Ad",
  "Presentation",
]);

const audio = t([
  "Audio Joiner", "Audio Track & Sound Effects", "Change Audio Speed", "Change Audio Volume",
  "Change Pitch", "Equalizer", "Reverse Audio", "Text to Speech", "Trim Audio",
  "Voice Recorder", "Voiceover",
]);

const photo = t([
  "Auto Focus", "Background Remover", "Blur", "Duotone", "Filters", "Frames", "Grab Text",
  "Magic Edit", "Magic Eraser", "Magic Expand", "Magic Grab", "Mockups", "Photo Adjustments",
  "Pixel Eraser", "Shadows", "Smart Crop",
]);

const pdf = t([
  "Add Page Numbers to PDF", "Compress PDF", "Merge PDF", "Protect PDF", "Rotate PDF",
  "Split PDF", "Unlock PDF",
]);

const converters = t([
  "Archive Converter", "Archive Extractor", "Audio Converter", "Document Converter",
  "Ebook Converter", "Excel to PDF", "Font Converter", "Image Converter", "JPG to PDF",
  "PDF to Excel", "PDF to HTML", "PDF to JPG", "PDF to PNG", "PDF to PPT", "PDF to Word",
  "PDF to PDF/A", "PNG to PDF",
  "PPT to PDF", "Text Case Converter", "Video Converter", "Word to PDF",
  ...converterExtraTools,
]);


const designGroups: Group[] = [
  {
    label: "Social Media",
    tools: t([
      "Animated Instagram Post (4:5)", "Animated Social Media", "Facebook Ad",
      "Facebook App Ad", "Facebook Cover (Landscape)", "Facebook Event Cover",
      "Facebook Post (940 x 788 px)", "Facebook Shop Ad", "Facebook Story",
      "Good Morning WhatsApp Status", "Good Night WhatsApp Status", "Instagram Ad (4:5)",
      "Instagram Carousel", "Instagram Feed Ad", "Instagram Highlight Cover",
      "Instagram Post (4:5)", "Instagram Post (Square)", "Instagram Profile Picture",
      "Instagram Reel", "Instagram Story", "Instagram Story Ad", "Link in Bio",
      "LinkedIn Background Photo", "LinkedIn Banner", "LinkedIn Post", "Pinterest Pin (2:3)",
      "Social Media", "SoundCloud Banner", "TikTok Ad", "TikTok Video", "Tumblr Graphic",
      "Twitch Banner", "Twitch Emote", "Twitch Panel", "Twitter / X Post (1600 x 900 px)",
      "Twitter Header", "WhatsApp Status", "YouTube Banner", "YouTube Channel Art",
      "YouTube Display Ad", "YouTube Intro", "YouTube Thumbnail",
    ]),
  },
  {
    label: "Business & Marketing",
    tools: t([
      "Banner", "Brand Guidelines", "Brochure", "Business Card (Landscape)",
      "Business Card (Portrait)", "Business Card (Square)", "Business Plan", "Certificate",
      "Door Hanger", "Email Header", "Email Signature", "Flyer (Landscape US)",
      "Flyer (Portrait US)", "Invoice", "Label", "Logo", "Menu", "Newsletter",
      "Poster (Landscape)", "Poster (Portrait)", "Proposal", "Rack Card", "Report",
    ]),
  },
  {
    label: "Visuals, Books & Miscellaneous",
    tools: t([
      "Book Cover", "Calendar", "Checklist", "Concept Map", "Daily Planner",
      "Desktop Wallpaper", "eBook", "eBook Cover", "Graph", "Infographic", "Journal",
      "Magazine", "Magazine Cover", "Mind Map", "Phone Wallpaper", "Photo Collage", "Planner",
      "Tracker", "Weekly Schedule", "Zoom Virtual Background",
    ]),
  },
  {
    label: "Printables & Stationery",
    tools: t([
      "Announcement", "Card (Landscape)", "Card (Portrait)", "Folded Card",
      "Gift Certificate (Landscape)", "Greeting Card", "Invitation (Portrait)",
      "Invitation (Square)", "Letterhead", "Postcard (Landscape)", "Receipt", "Save the Date",
      "Tag (Landscape)", "Thank You Card",
    ]),
  },
  {
    label: "Education",
    tools: t([
      "Class Schedule", "Classroom Poster", "Comic Strip", "Flashcard", "Graphic Organizer",
      "Group Work", "Lesson Plan", "Storyboard", "Worksheet",
    ]),
  },
  {
    label: "Custom Prints",
    tools: t(["Hoodie", "Mug", "Sticker", "Sweatshirt", "T-Shirt", "Tote Bag", "Water Bottle"]),
  },
  {
    label: "Docs & Whiteboards",
    tools: t([
      "Brainstorm Whiteboard", "Doc", "Flowchart Whiteboard", "Planning Whiteboard",
      "Team Whiteboard", "Whiteboard",
    ]),
  },
];

const designTools = designGroups.flatMap((g) => g.tools);

export const sections: Section[] = [
  { id: "video", label: "VIDEO", icon: Film, total: video.length, tools: video },
  { id: "audio", label: "AUDIO", icon: Music4, total: audio.length, tools: audio },
  { id: "pdf", label: "PDF", icon: FileText, total: pdf.length, tools: pdf },
  { id: "converters", label: "CONVERTERS", icon: Repeat, total: converters.length, tools: converters },
  { id: "photo", label: "PHOTO", icon: ImageIcon, total: photo.length, tools: photo },
  {
    id: "design",
    label: "DESIGN",
    icon: Shapes,
    total: designTools.length,
    tools: designTools,
    groups: designGroups,
  },
];

export const totalToolCount = sections.reduce((n, s) => n + s.total, 0);

// ---------------------------------------------------------------------------
// Flat category list used by the Studio tools dialog (Canva-style layout).
// The DESIGN section is expanded into its individual groups.
// ---------------------------------------------------------------------------

export type SubGroup = { label: string; tools: Tool[] };
export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
  tools: Tool[];
  popular: string[];
  subgroups: SubGroup[];
};


const popularOf = (names: string[]) => names;

const designPopular: Record<string, string[]> = {
  "Social Media": [
    "Instagram Post (4:5)", "Instagram Story", "Instagram Reel", "Facebook Post (940 x 788 px)",
    "WhatsApp Status", "YouTube Thumbnail", "LinkedIn Post", "TikTok Video",
  ],
  "Business & Marketing": [
    "Logo", "Poster (Portrait)", "Flyer (Portrait US)", "Business Card (Landscape)",
    "Invoice", "Brochure", "Menu", "Certificate",
  ],
  "Visuals, Books & Miscellaneous": [
    "Infographic", "Photo Collage", "Book Cover", "Mind Map",
    "Calendar", "Desktop Wallpaper", "Phone Wallpaper", "Planner",
  ],
  "Printables & Stationery": [
    "Greeting Card", "Invitation (Portrait)", "Letterhead", "Postcard (Landscape)",
    "Thank You Card", "Save the Date",
  ],
  Education: ["Worksheet", "Lesson Plan", "Flashcard", "Classroom Poster", "Storyboard", "Comic Strip"],
  "Custom Prints": ["T-Shirt", "Mug", "Sticker", "Hoodie", "Tote Bag"],
  "Docs & Whiteboards": ["Doc", "Whiteboard", "Flowchart Whiteboard", "Brainstorm Whiteboard"],
};

// Every tool of a category belongs to a named sub-category (no catch-all "Others").
const subgroupNames: Record<string, Record<string, string[]>> = {
  video: {
    "Editing & Trimming": [
      "Video Editor", "Video Trimmer", "Merge Videos", "Crop Video", "Resize Video",
      "Rotate Video", "Flip Video", "Loop Video",
    ],
    "Audio, Text & Overlays": [
      "Add Audio to Video", "Change Video Volume", "Beat Sync", "Add Image to Video",
      "Add Text to Video",
    ],
    "Enhance & Cleanup": [
      "Change Video Speed", "Stabilize Video", "Remove Logo from Video", "Magic Switch",
    ],
    Recording: ["Screen Recorder", "Video Recorder"],
    "Social & Templates": [
      "Facebook Video", "LinkedIn Video Ad", "Mobile Video", "Pinterest Video Pin",
      "Slideshow Video", "Video Template", "Video Message", "YouTube Video",
      "YouTube Video Ad", "Presentation",
    ],
  },
  audio: {
    "Edit & Arrange": ["Audio Joiner", "Trim Audio", "Reverse Audio"],
    "Sound Design": [
      "Audio Track & Sound Effects", "Equalizer", "Change Pitch", "Change Audio Speed",
      "Change Audio Volume",
    ],
    Voice: ["Text to Speech", "Voice Recorder", "Voiceover"],
  },
  photo: {
    "Retouch & Cleanup": [
      "Magic Eraser", "Pixel Eraser", "Magic Edit", "Background Remover", "Shadows",
    ],
    "Crop & Frame": ["Smart Crop", "Auto Focus", "Magic Expand", "Magic Grab", "Frames"],
    "Color & Style": ["Filters", "Duotone", "Photo Adjustments", "Blur"],
    "Extract & Present": ["Grab Text", "Mockups"],
  },
  pdf: {
    "Organize Pages": ["Merge PDF", "Split PDF", "Rotate PDF", "Add Page Numbers to PDF"],
    "Optimize & Secure": ["Compress PDF", "Protect PDF", "Unlock PDF"],
  },
  converters: {
    "Convert from PDF": [
      "PDF to JPG", "PDF to Word", "PDF to PPT", "PDF to Excel", "PDF to PDF/A",
      "PDF to PNG", "PDF to HTML",
    ],
    "Convert to PDF": [
      "JPG to PDF", "Word to PDF", "PPT to PDF", "Excel to PDF", "HTML to PDF", "PNG to PDF",
    ],

    Media: ["Audio Converter", "Video Converter", "Image Converter"],
    "Files, Fonts & Text": [
      "Archive Converter", "Archive Extractor", "Document Converter", "Ebook Converter",
      "Font Converter", "Text Case Converter",
    ],
    ...converterExtraGroups,
  },
  "social-media": {
    Instagram: [
      "Animated Instagram Post (4:5)", "Instagram Ad (4:5)", "Instagram Carousel",
      "Instagram Feed Ad", "Instagram Highlight Cover", "Instagram Post (4:5)",
      "Instagram Post (Square)", "Instagram Profile Picture", "Instagram Reel",
      "Instagram Story", "Instagram Story Ad",
    ],
    Facebook: [
      "Facebook Ad", "Facebook App Ad", "Facebook Cover (Landscape)", "Facebook Event Cover",
      "Facebook Post (940 x 788 px)", "Facebook Shop Ad", "Facebook Story",
    ],
    YouTube: [
      "YouTube Banner", "YouTube Channel Art", "YouTube Display Ad", "YouTube Intro",
      "YouTube Thumbnail",
    ],
    "TikTok & Pinterest": ["TikTok Ad", "TikTok Video", "Pinterest Pin (2:3)"],
    WhatsApp: [
      "Good Morning WhatsApp Status", "Good Night WhatsApp Status", "WhatsApp Status",
    ],
    "LinkedIn & X": [
      "LinkedIn Background Photo", "LinkedIn Banner", "LinkedIn Post",
      "Twitter / X Post (1600 x 900 px)", "Twitter Header",
    ],
    "Streaming & Music": ["Twitch Banner", "Twitch Emote", "Twitch Panel", "SoundCloud Banner"],
    "Cross-Platform": ["Animated Social Media", "Link in Bio", "Social Media", "Tumblr Graphic"],
  },
  "business-marketing": {
    "Brand Identity": [
      "Logo", "Brand Guidelines", "Business Card (Landscape)", "Business Card (Portrait)",
      "Business Card (Square)",
    ],
    "Print Promotion": [
      "Banner", "Brochure", "Flyer (Landscape US)", "Flyer (Portrait US)",
      "Poster (Landscape)", "Poster (Portrait)", "Rack Card", "Door Hanger", "Label", "Menu",
    ],
    "Documents & Sales": ["Business Plan", "Proposal", "Report", "Invoice", "Certificate"],
    "Email & Newsletters": ["Email Header", "Email Signature", "Newsletter"],
  },
  "visuals-books-miscellaneous": {
    "Books & Publications": ["Book Cover", "eBook", "eBook Cover", "Magazine", "Magazine Cover"],
    "Data & Diagrams": ["Infographic", "Graph", "Mind Map", "Concept Map"],
    "Planners & Trackers": [
      "Calendar", "Checklist", "Daily Planner", "Journal", "Planner", "Tracker",
      "Weekly Schedule",
    ],
    "Wallpapers & Collages": [
      "Desktop Wallpaper", "Phone Wallpaper", "Photo Collage", "Zoom Virtual Background",
    ],
  },
  "printables-stationery": {
    Cards: [
      "Card (Landscape)", "Card (Portrait)", "Folded Card", "Greeting Card",
      "Thank You Card", "Postcard (Landscape)",
    ],
    "Invitations & Events": [
      "Invitation (Portrait)", "Invitation (Square)", "Save the Date", "Announcement",
    ],
    "Office & Gifting": [
      "Letterhead", "Receipt", "Gift Certificate (Landscape)", "Tag (Landscape)",
    ],
  },
  education: {
    "Teaching Materials": ["Lesson Plan", "Worksheet", "Flashcard", "Graphic Organizer"],
    "Classroom & Planning": ["Class Schedule", "Classroom Poster", "Group Work"],
    Storytelling: ["Comic Strip", "Storyboard"],
  },
  "custom-prints": {
    Apparel: ["T-Shirt", "Hoodie", "Sweatshirt"],
    "Drinkware & Bags": ["Mug", "Water Bottle", "Tote Bag"],
    Stickers: ["Sticker"],
  },
  "docs-whiteboards": {
    Documents: ["Doc"],
    Whiteboards: [
      "Whiteboard", "Brainstorm Whiteboard", "Flowchart Whiteboard", "Planning Whiteboard",
      "Team Whiteboard",
    ],
  },
};

function buildSubgroups(id: string, tools: Tool[]): SubGroup[] {
  const spec = subgroupNames[id] ?? {};
  const assigned = new Set<string>();
  const groups: SubGroup[] = [];
  for (const [label, names] of Object.entries(spec)) {
    const picked = names
      .filter((n) => tools.some((t) => t.name === n))
      .map((name) => ({ name }));
    picked.forEach((t) => assigned.add(t.name));
    if (picked.length > 0) groups.push({ label, tools: picked });
  }
  const rest = tools.filter((t) => !assigned.has(t.name));
  if (rest.length > 0) groups.push({ label: "More Tools", tools: rest });
  return groups;
}

const designIcons: Record<string, LucideIcon> = {
  "Social Media": Share2,
  "Business & Marketing": Briefcase,
  "Visuals, Books & Miscellaneous": BookOpen,
  "Printables & Stationery": Printer,
  Education: GraduationCap,
  "Custom Prints": Shirt,
  "Docs & Whiteboards": PanelsTopLeft,
};


const rawCategories: Omit<Category, "subgroups">[] = [
  {
    id: "video",
    label: "Video",
    icon: Film,
    tools: video,
    popular: popularOf([
      "Video Editor", "Video Trimmer", "Merge Videos", "Crop Video",
      "Change Video Speed", "Add Audio to Video", "Screen Recorder", "YouTube Video",
    ]),
  },
  {
    id: "audio",
    label: "Audio",
    icon: Music4,
    tools: audio,
    popular: popularOf([
      "Trim Audio", "Audio Joiner", "Text to Speech", "Change Audio Volume",
      "Voice Recorder", "Change Pitch",
    ]),
  },
  {
    id: "photo",
    label: "Photo",
    icon: ImageIcon,
    tools: photo,
    popular: popularOf([
      "Background Remover", "Magic Eraser", "Smart Crop", "Filters",
      "Photo Adjustments", "Grab Text",
    ]),
  },
  {
    id: "pdf",
    label: "PDF",
    icon: FileText,
    tools: pdf,
    popular: popularOf(["Merge PDF", "Compress PDF", "Split PDF", "Protect PDF"]),
  },
  {
    id: "converters",
    label: "Converters",
    icon: Repeat,
    tools: converters,
    popular: popularOf([
      "Text Case Converter", "Image Converter", "PDF to Word", "Word to PDF",
      "JPG to PDF", "Video Converter", "Audio Converter",
    ]),
  },
  ...designGroups.map((g) => ({
    id: g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label: g.label,
    icon: designIcons[g.label] ?? Shapes,
    tools: g.tools,
    popular: (designPopular[g.label] ?? g.tools.slice(0, 6).map((t) => t.name)).filter((n) =>
      g.tools.some((t) => t.name === n),
    ),
  })),
];

export const categories: Category[] = rawCategories.map((c) => ({
  ...c,
  subgroups: buildSubgroups(c.id, c.tools),
}));


export const allTools: Tool[] = categories.flatMap((c) => c.tools);
