"use client";

type DeleteLadderButtonProps = {
  ladderId: string;
  ladderName: string;
  deleteLadder: (formData: FormData) => Promise<void>;
};

export default function DeleteLadderButton({
  ladderId,
  ladderName,
  deleteLadder,
}: DeleteLadderButtonProps) {
  return (
    <form
      action={deleteLadder}
      onSubmit={(event) => {
        if (
          !confirm(
            `Delete ladder league "${ladderName}"? This removes all players and challenges permanently.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="ladderId" value={ladderId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        Delete
      </button>
    </form>
  );
}
