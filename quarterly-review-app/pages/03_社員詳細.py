"""社員詳細ページ（改善版）

改善点:
- 最新四半期のサマリーを上部にカード表示
- 「次回面談で確認すべきポイント」自動表示
- 強みの定着・継続課題の検出表示
- 指導コメント履歴の整理
- 成長の軌跡をわかりやすく
"""

import streamlit as st
import sys
import pandas as pd
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib import database as db
from lib import charts
from lib.feedback_engine import (
    get_strengths, get_weaknesses, get_priority_items, get_gap_items,
    generate_summary, get_coaching_points, get_persistent_issues,
    get_stable_strengths, get_next_meeting_points
)
from lib.charts import EVAL_LABELS, EVAL_KEYS_SELF, EVAL_KEYS_SUP, ACTIVITY_LABELS, ACTIVITY_KEYS

st.set_page_config(page_title="社員詳細", page_icon="👤", layout="wide")

st.title("👤 社員詳細")

employees = db.get_all_employees()
if not employees:
    st.warning("社員が登録されていません。")
    st.stop()

# 社員選択
emp_options = {f"{e['name']}（{e['department']}）": e["id"] for e in employees}
selected_label = st.selectbox("社員を選択", list(emp_options.keys()))
emp_id = emp_options[selected_label]
emp = db.get_employee(emp_id)

# データ取得
reviews = db.get_reviews_for_employee(emp_id)
latest = reviews[-1] if reviews else None
previous = db.get_previous_review(emp_id, latest["fiscal_year"], latest["quarter"]) if latest else None

# --- 基本情報カード ---
st.markdown(
    f'<div style="background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:10px;padding:1rem 1.5rem;margin-bottom:1rem;border:1px solid #dee2e6;">'
    f'<div style="display:flex;flex-wrap:wrap;gap:2rem;align-items:center;">'
    f'<div><strong style="font-size:1.2rem;">{emp["name"]}</strong></div>'
    f'<div>所属: {emp["department"]}</div>'
    f'<div>指導担当: {emp["supervisor"]}</div>'
    f'<div>経験: {emp["experience_years"]}年</div>'
    f'</div>'
    f'{"<div style=&quot;margin-top:0.5rem;color:#666;font-size:0.9rem;&quot;>" + emp["notes"] + "</div>" if emp.get("notes") else ""}'
    f'</div>',
    unsafe_allow_html=True
)

if not reviews:
    st.info("この社員の四半期データはまだ登録されていません。「四半期入力」ページから登録してください。")
    st.stop()

# === 最新四半期サマリー（上部に配置） ===
st.subheader(f"📋 最新サマリー — {latest['fiscal_year']}年度{latest['quarter']}Q")

# 総評カード
summary = generate_summary(latest, previous)
status_text = "✅ 提出済" if latest["status"] == "submitted" else "📝 下書き"
st.markdown(
    f'<div style="background:#f0f8ff;border-left:4px solid #1f77b4;border-radius:6px;padding:1rem 1.2rem;margin-bottom:1rem;">'
    f'<div style="font-size:0.85rem;color:#666;margin-bottom:0.3rem;">{status_text}</div>'
    f'<div style="font-size:0.95rem;line-height:1.6;">{summary}</div></div>',
    unsafe_allow_html=True
)

# 指標カード
m_col1, m_col2, m_col3, m_col4 = st.columns(4)
total_act = sum(latest.get(k, 0) for k in ACTIVITY_KEYS)
avg_self = sum(latest.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
prev_total = sum(previous.get(k, 0) for k in ACTIVITY_KEYS) if previous else None
prev_avg = sum(previous.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF) if previous else None

with m_col1:
    delta = f"{total_act - prev_total:+d}件" if prev_total is not None else None
    st.metric("活動合計", f"{total_act}件", delta=delta)
with m_col2:
    delta = f"{avg_self - prev_avg:+.1f}" if prev_avg is not None else None
    st.metric("自己評価平均", f"{avg_self:.1f}", delta=delta)
with m_col3:
    st.metric("成約件数", f"{latest.get('contract_count', 0)}件")
with m_col4:
    comp = latest.get("self_compliance", 0)
    delta_color = "inverse" if comp <= 2 else "off"
    st.metric("コンプラ意識", f"{comp}/5",
              delta="要注意" if comp <= 2 else None, delta_color=delta_color)

# 強み・課題
s_col, w_col = st.columns(2)
with s_col:
    st.markdown("**💪 強み**")
    for name, score in get_strengths(latest):
        color = "#2ca02c" if score >= 4 else "#1f77b4"
        st.markdown(f'<span style="color:{color};">● {name}（{score}）</span>', unsafe_allow_html=True)
with w_col:
    st.markdown("**📌 課題**")
    for name, score in get_weaknesses(latest):
        color = "#d62728" if score <= 2 else "#ff7f0e"
        st.markdown(f'<span style="color:{color};">● {name}（{score}）</span>', unsafe_allow_html=True)

st.markdown("---")

# === 次回面談で確認すべきポイント ===
st.subheader("🎯 次回面談で確認すべきポイント")
meeting_points = get_next_meeting_points(latest, previous, reviews)
if meeting_points:
    for i, point in enumerate(meeting_points, 1):
        st.markdown(
            f'<div style="background:#f8f9fa;border-left:3px solid #1f77b4;padding:0.5rem 0.8rem;'
            f'border-radius:4px;margin-bottom:0.4rem;font-size:0.9rem;">'
            f'{i}. {point}</div>',
            unsafe_allow_html=True
        )
else:
    st.caption("特記事項はありません。")

st.markdown("---")

# === 強みの定着・継続課題 ===
if len(reviews) >= 2:
    col_stable, col_persist = st.columns(2)

    with col_stable:
        st.subheader("✅ 定着している強み")
        stable = get_stable_strengths(reviews)
        if stable:
            for s in stable:
                st.markdown(
                    f'<div style="background:#d4edda;padding:0.4rem 0.8rem;border-radius:4px;margin-bottom:0.3rem;">'
                    f'● {s["label"]} — {s["quarters"]}四半期連続で高評価</div>',
                    unsafe_allow_html=True
                )
        else:
            st.caption("2四半期以上連続で高評価の項目はまだありません。")

    with col_persist:
        st.subheader("⚠️ 継続している課題")
        persistent = get_persistent_issues(reviews)
        if persistent:
            for p in persistent:
                st.markdown(
                    f'<div style="background:#fff3cd;border-left:3px solid #ff7f0e;padding:0.4rem 0.8rem;'
                    f'border-radius:4px;margin-bottom:0.3rem;">'
                    f'● {p["label"]} — {p["detail"]}</div>',
                    unsafe_allow_html=True
                )
        else:
            st.caption("2四半期以上連続する課題項目はありません。")

    st.markdown("---")

# === フィルタ ===
years = sorted(set(r["fiscal_year"] for r in reviews), reverse=True)
filter_year = st.selectbox("年度フィルタ", ["すべて"] + years, key="detail_year")
filtered = reviews if filter_year == "すべて" else [r for r in reviews if r["fiscal_year"] == filter_year]

# === 四半期データ一覧 ===
st.subheader("📊 四半期データ一覧")
table_data = []
for r in filtered:
    total_activity = sum(r.get(k, 0) for k in ACTIVITY_KEYS)
    avg_s = sum(r.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
    avg_p = sum(r.get(k, 0) for k in EVAL_KEYS_SUP) / len(EVAL_KEYS_SUP)
    table_data.append({
        "期間": f"{r['fiscal_year']}年度{r['quarter']}Q",
        "状態": "提出済" if r["status"] == "submitted" else "下書き",
        "活動計": total_activity,
        "自己評価": f"{avg_s:.1f}",
        "指導者評価": f"{avg_p:.1f}" if avg_p > 0 else "—",
        "重点項目": r.get("priority_action", "") or "—",
        "達成": r.get("priority_action_result", "") or "—",
    })
st.dataframe(pd.DataFrame(table_data), use_container_width=True, hide_index=True)

st.markdown("---")

# === グラフ ===
tab_radar, tab_activity, tab_eval_trend, tab_gap = st.tabs([
    "🎯 レーダーチャート", "📊 活動実績推移", "📈 自己評価推移", "🔍 評価ギャップ"
])

with tab_radar:
    col1, col2 = st.columns(2)
    with col1:
        fig = charts.radar_chart(latest, "自己評価 / 指導者評価")
        st.plotly_chart(fig, use_container_width=True)
    with col2:
        if previous:
            fig2 = charts.radar_comparison(latest, previous)
            st.plotly_chart(fig2, use_container_width=True)
        else:
            st.info("前回データがないため比較できません。")

with tab_activity:
    fig = charts.activity_trend_chart(filtered, "活動実績推移")
    st.plotly_chart(fig, use_container_width=True)

with tab_eval_trend:
    fig = charts.eval_trend_chart(filtered, "自己評価項目の推移")
    st.plotly_chart(fig, use_container_width=True)

with tab_gap:
    gap_fig = charts.eval_gap_chart(latest)
    if gap_fig:
        st.plotly_chart(gap_fig, use_container_width=True)
        gap_items = get_gap_items(latest)
        if gap_items:
            for g in gap_items:
                icon = "🔺" if g["diff"] > 0 else "🔻"
                st.warning(f'{icon} **{g["label"]}** — 自己: {g["self"]}、指導者: {g["sup"]}（差: {g["diff"]:+d}）… {g["note"]}')
    else:
        st.info("指導者評価が未入力のため、ギャップ分析はできません。")

st.markdown("---")

# === 活動量と自己評価のバランス ===
st.subheader("⚖️ 活動量と自己評価のバランス")
balance_fig = charts.activity_eval_balance(latest)
st.plotly_chart(balance_fig, use_container_width=True)

st.markdown("---")

# === 指導コメント履歴 ===
st.subheader("📝 指導コメント履歴")
for r in reversed(filtered):
    period = f"{r['fiscal_year']}年度{r['quarter']}Q"
    has_content = any(r.get(k) for k in ["supervisor_comment", "next_focus", "priority_action", "coaching_memo"])

    with st.expander(period + (" — コメントあり" if has_content else ""), expanded=(r == latest)):
        if r.get("supervisor_comment"):
            st.markdown(f"**指導者コメント**")
            st.markdown(f"> {r['supervisor_comment']}")
        if r.get("next_focus"):
            st.markdown(f"**次回重点確認:** {r['next_focus']}")
        if r.get("priority_action"):
            result = r.get("priority_action_result", "—")
            st.markdown(f"**重点実行項目:** {r['priority_action']}　→　達成状況: {result or '—'}")
        if r.get("coaching_memo"):
            st.markdown(f"**指導メモ（内部用）:** {r['coaching_memo']}")
        if not has_content:
            st.caption("コメント未入力")

st.markdown("---")

# === 成長の軌跡 ===
st.subheader("📈 成長の軌跡")
if len(filtered) >= 2:
    for i in range(1, len(filtered)):
        cur = filtered[i]
        prev_r = filtered[i - 1]
        period = f"{prev_r['fiscal_year']}年度{prev_r['quarter']}Q → {cur['fiscal_year']}年度{cur['quarter']}Q"

        improved = []
        declined = []
        for j, k in enumerate(EVAL_KEYS_SELF):
            diff = cur.get(k, 0) - prev_r.get(k, 0)
            if diff >= 1:
                improved.append(f"{EVAL_LABELS[j]}(+{diff})")
            elif diff <= -1:
                declined.append(f"{EVAL_LABELS[j]}({diff})")

        prev_act = sum(prev_r.get(k, 0) for k in ACTIVITY_KEYS)
        cur_act = sum(cur.get(k, 0) for k in ACTIVITY_KEYS)
        act_diff = cur_act - prev_act

        st.markdown(f"**{period}**")
        parts = []
        if improved:
            parts.append(f"✅ 改善: {', '.join(improved)}")
        if declined:
            parts.append(f"⚠️ 低下: {', '.join(declined)}")
        if act_diff != 0:
            icon = "📈" if act_diff > 0 else "📉"
            parts.append(f"{icon} 活動量: {act_diff:+d}件")
        if parts:
            st.markdown("　".join(parts))
        else:
            st.caption("変化なし")
else:
    st.caption("2期以上のデータが蓄積されると、成長の軌跡が表示されます。")
