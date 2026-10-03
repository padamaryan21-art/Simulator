import { SessionView } from "@/components/conversations/session-view";

export default async function Page({ params }: PageProps<"/ai/simulator/[id]">) {
  const { id } = await params;
  return <SessionView id={id} />;
}
