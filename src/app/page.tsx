import dynamic from "next/dynamic";

const MiniApp = dynamic(
    () => import("@/components/app/mini-app").then((mod) => mod.MiniApp),
    {
      ssr: false,
    }
);

export default function HomePage() {
  return <MiniApp />;
}