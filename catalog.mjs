/** Working-adult JP prices for the "what this turn cost" punchline. */
export const ITEMS = [
    { yen: 160, name: "自販機の飲み物", emoji: "🥤", unit: "本" },
    { yen: 170, name: "缶チューハイ", emoji: "🍺", unit: "本" },
    { yen: 180, name: "ガソリン", emoji: "⛽", unit: "L" },
    { yen: 250, name: "缶ビール", emoji: "🍻", unit: "本" },
    { yen: 650, name: "タバコ", emoji: "🚬", unit: "箱" },
    { yen: 1000, name: "ランチ", emoji: "🍱", unit: "食" },
];

const EXTRA_ORDER = [
    "ランチ",
    "ガソリン",
    "タバコ",
    "自販機の飲み物",
    "缶ビール",
    "缶チューハイ",
];

export function describePurchase(jpy) {
    const yen = Number.isFinite(jpy) ? Math.max(0, jpy) : 0;
    const extras = extrasFor(yen);
    if (yen < 0.5) {
        return {
            headline: "誤差の範囲",
            sub: "1円未満。自販機のボタンを押し損ねたくらいです",
            item: null,
            count: 0,
            extras,
        };
    }
    const smallest = ITEMS[0];
    if (yen < smallest.yen) {
        const pct = Math.max(1, Math.round((yen / smallest.yen) * 100));
        return {
            headline: `${smallest.name}の約${pct}%`,
            sub: `≒ ¥${formatYen(yen)}  — まだ1本にも足りません`,
            item: smallest,
            count: 0,
            extras,
        };
    }

    const affordable = [...ITEMS].filter((i) => i.yen <= yen).reverse();
    const best = affordable[0] ?? smallest;
    const count = Math.floor(yen / best.yen);
    const remainder = yen - count * best.yen;

    return {
        headline: `${best.emoji} ${best.name} ${formatCount(count)}${best.unit}分`,
        sub: remainder >= 1
            ? `≒ ¥${formatYen(yen)}  （余り ¥${formatYen(remainder)}）`
            : `≒ ¥${formatYen(yen)}`,
        item: best,
        count,
        extras,
    };
}

function extrasFor(yen) {
    const byName = Object.fromEntries(ITEMS.map((i) => [i.name, i]));
    return EXTRA_ORDER.map((name) => byName[name]).filter(Boolean).map((i) => ({
        ...i,
        count: yen / i.yen,
    }));
}

function formatCount(n) {
    return n.toLocaleString("ja-JP");
}

export function formatYen(n) {
    if (n >= 100) return Math.round(n).toLocaleString("ja-JP");
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
}
