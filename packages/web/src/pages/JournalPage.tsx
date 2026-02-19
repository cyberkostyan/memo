import { JournalView } from "../components/journal/JournalView";

export function JournalPage() {
  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold">Journal</h1>
      </div>
      <JournalView />
    </div>
  );
}
