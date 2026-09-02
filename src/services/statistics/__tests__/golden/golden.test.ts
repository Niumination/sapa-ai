import { describe, it, expect } from 'vitest';
import { routeQuestion } from '@/services/statistics/question-router';

const GOLDEN = [
  { q: 'tren stunting 5 tahun terakhir', archetype: 'trend' },
  { q: 'bandingkan kemiskinan antar kecamatan', archetype: 'comparison' },
  { q: 'kecamatan tertinggi stunting', archetype: 'ranking' },
  { q: 'persen desil 1 per kecamatan', archetype: 'distribution' },
  { q: 'hubungan kemiskinan dan stunting', archetype: 'correlation' },
  { q: 'berapa OPD yang melaporkan data', archetype: 'meta' },
  { q: 'data NIK warga Bebesen', archetype: 'personal' },
  { q: 'berapa penduduk Aceh Tengah', archetype: 'level' },
];

describe('WP6 golden routing', () => {
  it.each(GOLDEN)('"$q" → $archetype', ({ q, archetype }) => {
    const plan = routeQuestion(q);
    expect(plan.archetype).toBe(archetype);
  });
});
