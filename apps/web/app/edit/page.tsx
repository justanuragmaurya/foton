import type { Metadata } from "next";
import "@foton/editor/styles.css";
import { EditorMount } from "./EditorMount";

export const metadata: Metadata = { title: "Untitled-1 · Foton" };

export default function EditPage() {
  return (
    <main className="h-full">
      <EditorMount />
    </main>
  );
}
