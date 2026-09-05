// ─── Menjaga mutu SET evaluasi itu sendiri ───
// Set yang rusak (id dobel, regex ngawur, mode tak dikenal) membuat hasil eval
// tak bisa dipercaya. Uji ini berjalan tanpa jaringan — aman untuk CI.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Item {
  id: string;
  grup: string;
  pertanyaan: string;
  harus: 'jawab' | 'kosong' | 'jujur' | 'aman' | 'defleksi';
  polaRelevan?: string[];
  polaTop1?: string;
  alasan?: string;
}

const set = JSON.parse(readFileSync(join(process.cwd(), 'data', 'eval-set.json'), 'utf8')) as {
  versi: number;
  item: Item[];
  invarians: { jargonInternal: string[] };
};

const MODE = ['jawab', 'kosong', 'jujur', 'aman', 'defleksi'];

describe('data/eval-set.json', () => {
  it('memuat item dengan field wajib', () => {
    expect(set.versi).toBeGreaterThan(0);
    expect(set.item.length).toBeGreaterThan(0);
    for (const it of set.item) {
      expect(it.id, 'id wajib ada').toBeTruthy();
      expect(it.pertanyaan?.length ?? 0, `${it.id}: pertanyaan kosong`).toBeGreaterThan(3);
      expect(MODE, `${it.id}: mode "${it.harus}" tak dikenal`).toContain(it.harus);
      expect(it.alasan?.length ?? 0, `${it.id}: alasan kurasi wajib diisi`).toBeGreaterThan(10);
    }
  });

  it('id unik', () => {
    const semua = set.item.map((i) => i.id);
    expect(new Set(semua).size).toBe(semua.length);
  });

  it('pertanyaan unik — tidak ada duplikat tersembunyi', () => {
    const norm = set.item.map((i) => i.pertanyaan.trim().toLowerCase());
    const dobel = norm.filter((q, i) => norm.indexOf(q) !== i);
    expect(dobel).toEqual([]);
  });

  it('regex pada polaRelevan/polaTop1 valid', () => {
    for (const it of set.item) {
      for (const p of it.polaRelevan ?? []) {
        expect(() => new RegExp(p, 'i'), `${it.id}: regex ${p}`).not.toThrow();
      }
      const top1 = it.polaTop1;
      if (top1) {
        expect(() => new RegExp(top1, 'i'), `${it.id}: polaTop1`).not.toThrow();
      }
    }
  });

  it('mode "jawab"/"jujur" wajib punya polaRelevan agar relevansi bisa dinilai', () => {
    for (const it of set.item) {
      if (it.harus === 'jawab' || it.harus === 'jujur') {
        expect((it.polaRelevan ?? []).length, `${it.id}: polaRelevan kosong`).toBeGreaterThan(0);
      }
    }
  });

  it('tidak memuat NIK 16 digit — X1 memakai token {{NIK_UJI}}', () => {
    // Repo harus bersih dari string berbentuk NIK agar pii-gate tidak
    // memblokir commit; angkanya dibangkitkan runner saat eval berjalan.
    const teks = JSON.stringify(set);
    expect(teks.match(/\b\d{16}\b/g) ?? []).toEqual([]);
    const x1 = set.item.find((i) => i.id === 'X1');
    expect(x1?.pertanyaan).toContain('{{NIK_UJI}}');
  });

  it('invarians jargon internal terdefinisi', () => {
    expect((set.invarians.jargonInternal ?? []).length).toBeGreaterThan(0);
  });
});
