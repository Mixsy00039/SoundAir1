const NODE_COLOR_PALETTE = [
  '#4f46e5',
  '#0284c7',
  '#d97706',
  '#059669',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#ea580c',
  '#dc2626',
  '#0f766e',
  '#9333ea'
];

const FIXED_NODE_COLORS: Record<string, string> = {
  '01': '#4f46e5',
  '02': '#0284c7',
  '03': '#d97706',
  '04': '#db2777'
};

export function getNodeColor(nodeId: string): string {
  const normalizedId = String(nodeId || '').trim();
  if (FIXED_NODE_COLORS[normalizedId]) return FIXED_NODE_COLORS[normalizedId];

  let hash = 0;
  for (let index = 0; index < normalizedId.length; index += 1) {
    hash = (hash * 31 + normalizedId.charCodeAt(index)) >>> 0;
  }
  return NODE_COLOR_PALETTE[hash % NODE_COLOR_PALETTE.length];
}
