import Image from "next/image";
import { checkPin } from "@/app/actions/auth";

export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Lift Log" width={80} height={80} className="rounded-2xl" />
          <p className="text-gray-500 text-sm">Enter PIN to continue</p>
        </div>

        <form action={checkPin} className="space-y-4">
          <div className="space-y-2">
            <input
              type="password"
              name="pin"
              inputMode="numeric"
              placeholder="••••"
              maxLength={10}
              autoFocus
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-4 text-center text-2xl tracking-widest focus:outline-none focus:border-purple-400"
            />
            {error && (
              <p className="text-red-400 text-sm text-center">Incorrect PIN</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full bg-purple-400 hover:bg-purple-500 active:bg-purple-600 text-white font-bold py-4 rounded-xl transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
