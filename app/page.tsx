"use client";

import dynamic from "next/dynamic";

const TeachbackApp = dynamic(() => import("../src/core/WorkflowApp"), { ssr: false });

export default function Page() {
  return <TeachbackApp />;
}
