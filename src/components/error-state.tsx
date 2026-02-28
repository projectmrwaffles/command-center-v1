import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  message,
  details,
}: {
  title?: string;
  message?: string;
  details?: string;
}) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-red-800">{title}</CardTitle>
        {message && <CardDescription className="text-red-700">{message}</CardDescription>}
      </CardHeader>
      {details && (
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md border border-red-200 bg-white/60 p-3 text-xs text-red-900">
            {details}
          </pre>
        </CardContent>
      )}
    </Card>
  );
}
