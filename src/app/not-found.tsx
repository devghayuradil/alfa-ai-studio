import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <Compass className="size-8 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That page doesn&apos;t exist in Alfa AI Studio.</p>
      </div>
      <Button asChild variant="brand">
        <Link href="/">Back to the studio</Link>
      </Button>
    </div>
  );
}
