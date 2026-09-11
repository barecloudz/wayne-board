"use client";

import { useState, useTransition } from "react";
import { savePayrollEmailSettings, sendPayrollEmail } from "@/lib/actions/payroll-email";
import { Mail, Send, Loader2 } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  initialRecipients: string;
  initialDay: number;
  initialTime: string;
  weekStart: string;
  weekEnd: string;
};

export default function PayrollEmailSettings({ initialRecipients, initialDay, initialTime, weekStart, weekEnd }: Props) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime || "08:00");
  const [saved, setSaved] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isSending, startSend] = useTransition();

  function handleSave() {
    setSaved(false);
    startSave(async () => {
      await savePayrollEmailSettings(recipients, day, time);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleSendNow() {
    setSendResult(null);
    startSend(async () => {
      const result = await sendPayrollEmail(weekStart, weekEnd);
      setSendResult(result.success ? "Email sent!" : `Failed: ${result.error}`);
      setTimeout(() => setSendResult(null), 5000);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <Mail className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-900">Payroll Notifications</h2>
            <p className="text-[12px] text-slate-400">Email alerts when payroll is ready</p>
          </div>
        </div>
        {saved && <span className="text-[12px] font-semibold text-emerald-600">Saved ✓</span>}
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Recipients</label>
          <textarea
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            rows={3}
            placeholder={"manager@company.com\nowner@company.com"}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
          />
          <p className="text-[11px] text-slate-400 mt-1">One email per line or comma-separated</p>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-2">Send On</label>
          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDay(i)}
                className={`py-2 rounded-xl text-[12px] font-bold transition-colors ${
                  day === i
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[12px] font-semibold text-slate-700 whitespace-nowrap">At time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Settings
          </button>
          <button
            onClick={handleSendNow}
            disabled={isSending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send Now
          </button>
          {sendResult && (
            <span className={`text-[12px] font-semibold ${sendResult.startsWith("Failed") ? "text-red-600" : "text-emerald-600"}`}>
              {sendResult}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
