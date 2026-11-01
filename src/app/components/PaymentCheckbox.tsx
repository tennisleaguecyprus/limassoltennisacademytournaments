"use client";

import { useTransition } from "react";

type PaymentCheckboxProps = {
  ladderId: string;
  playerId: string;
  paid: boolean;
  playerName: string;
  togglePlayerPaid: (formData: FormData) => Promise<void>;
};

export default function PaymentCheckbox({
  ladderId,
  playerId,
  paid,
  playerName,
  togglePlayerPaid,
}: PaymentCheckboxProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <label
      className={`inline-flex items-center gap-2 ${isPending ? "opacity-60" : ""}`}
      title={paid ? "Marked as paid" : "Mark as paid"}
    >
      <input
        type="checkbox"
        checked={paid}
        disabled={isPending}
        className="h-4 w-4 accent-emerald-600"
        onChange={(event) => {
          const formData = new FormData();
          formData.set("ladderId", ladderId);
          formData.set("playerId", playerId);
          formData.set("paid", event.target.checked ? "true" : "false");
          startTransition(() => {
            void togglePlayerPaid(formData);
          });
        }}
      />
      <span className="font-medium">{playerName}</span>
    </label>
  );
}
