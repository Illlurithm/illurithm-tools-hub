import { TextCaseConverter } from "@/components/tools/TextCaseConverter";
import { TextToSpeech } from "@/components/tools/TextToSpeech";
import { JsonFormatter } from "@/components/tools/JsonFormatter";
import { PngToPdfWorkspace } from "@/components/tools/PngToPdfWorkspace";
import { PdfToPngWorkspace } from "@/components/tools/PdfToPngWorkspace";

export function ToolWorkspace({
  tool,
  pageId,
  preview = false,
}: {
  tool: string;
  pageId?: string;
  preview?: boolean;
}) {
  if (tool === "Text Case Converter") {
    return <TextCaseConverter />;
  }

  if (tool === "Text to Speech") {
    return <TextToSpeech />;
  }

  if (tool === "JSON Formatter" || tool === "JSON Validator") {
    return <JsonFormatter />;
  }

  if (tool === "PNG to PDF" && pageId) {
    return <PngToPdfWorkspace pageId={pageId} preview={preview} />;
  }

  if (tool === "JPG to PDF" && pageId) {
    return <PngToPdfWorkspace pageId={pageId} preview={preview} kind="jpg" />;
  }

  if (tool === "Word to PDF" && pageId) {
    return <PdfToPngWorkspace pageId={pageId} preview={preview} source="word" />;
  }

  if (
    (tool === "PDF to PNG" ||
      tool === "PDF to JPG" ||
      tool === "PDF to Word" ||
      tool === "PDF to PPT") &&
    pageId
  ) {
    return <PdfToPngWorkspace pageId={pageId} preview={preview} />;
  }


  return (
    <div className="grid h-full w-full place-items-center">
      <div className="text-center">
        <p className="select-none font-display text-3xl tracking-[0.3em] text-foreground/10 sm:text-5xl">
          {tool}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This tool is coming soon. Pick another tool from the Tools panel.
        </p>
      </div>
    </div>
  );
}
