'use client';
export default function AdminDtsenPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-[#1B4332]">Data DTSEN</h1>
      <div className="bg-[#FFFFFF] border border-[#C6C3B4] rounded-2xl p-5 space-y-2">
        <p className="text-sm text-[#4B5249]">Data DTSEN tidak tersedia di mode publik SAPA-only.</p>
        <p className="text-sm text-[#4B5249]">Silakan gunakan menu <strong>SAPA</strong> untuk mengakses data indikator resmi OPD.</p>
      </div>
    </div>
  );
}
