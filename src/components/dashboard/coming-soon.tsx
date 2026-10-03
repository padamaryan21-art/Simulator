import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="size-4" /> Not built yet
          </CardTitle>
          <CardDescription>Scheduled for {phase}.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This page is part of the planned build order and will be database-driven when implemented.
        </CardContent>
      </Card>
    </div>
  );
}
