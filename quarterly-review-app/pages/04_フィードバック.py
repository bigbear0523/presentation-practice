"""フィードバックページ（改善版）

改善点:
- 最上部に「今回の総評」カード
- 指導ポイント上位3つを自動表示
- 前回比較を改善・維持・低下で色分け
- ギャップ項目を目立たせる
- 自由記述の読みやすい表示
- 印刷レイアウト維持
"""

import streamlit as st
import sys
import datetime
import pandas as pd
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib import database as db
from lib import charts
from lib.feedback_engine import (
    generate_feedback, generate_summary, get_strengths, get_weaknesses,
    get_priority_items, get_gap_items, get_coaching_points
)
from lib.charts import EVAL_LABELS, EVAL_KEYS_SELF, EVAL_KEYS_SUP, ACTIVITY_LABELS, ACTIVITY_KEYS

st.set_page_config(page_title="フィードバック", page_icon="💬", layout="wide")

st.title("💬 フィードバック")

employees = db.get_all_employees()
if not employees:
    st.warning("社員が登録されていません。")
    st.stop()

# --- 選択 ---
col1, col2, col3 = st.columns(3)
with col1:
    emp_options = {f"{e['name']}（{e['department']}）": e["id"] for e in employees}
    selected_label = st.selectbox("社員", list(emp_options.keys()))
    emp_id = emp_options[selected_label]
with col2:
    current_year = datetime.date.today().year
    fiscal_year = st.selectbox("年度", list(range(current_year + 1, current_year - 5, -1)), key="fb_year")
with col3:
    quarter = st.selectbox("四半期", [1, 2, 3, 4], format_func=lambda x: f"{x}Q", key="fb_q")

emp = db.get_employee(emp_id)
review = db.get_review(emp_id, fiscal_year, quarter)
previous = db.get_previous_review(emp_id, fiscal_year, quarter)

if not review:
    st.warning(f"{fiscal_year}年度{quarter}Qのデータが見つかりません。先に「四半期入力」で登録してください。")
    st.stop()

# --- 印刷用CSS ---
st.markdown("""
<style>
@media print {
    [data-testid="stSidebar"] { display: none !important; }
    [data-testid="stHeader"] { display: none !important; }
    .stButton, .stForm { display: none !important; }
    .block-container { padding: 0 !important; max-width: 100% !important; }
    .print-header { display: block !important; }
    .no-print { display: none !important; }
}
.print-header { display: none; }
</style>
""", unsafe_allow_html=True)

# 印刷用ヘッダー
st.markdown(f"""
<div class="print-header" style="text-align:center;margin-bottom:1rem;">
    <h2>四半期振り返りフィードバックシート</h2>
    <p>{emp['name']}（{emp['department']}）— {fiscal_year}年度 {quarter}Q</p>
</div>
""", unsafe_allow_html=True)

# === 総評カード（最上部） ===
summary = generate_summary(review, previous)
status_text = "提出済" if review["status"] == "submitted" else "下書き"

st.markdown(
    f'<div style="background:linear-gradient(135deg,#f0f8ff,#e8f4fd);border-radius:10px;'
    f'padding:1.2rem 1.5rem;margin-bottom:1.5rem;border:1px solid #b8daff;">'
    f'<div style="font-size:0.85rem;color:#666;margin-bottom:0.3rem;">'
    f'{emp["name"]}（{emp["department"]}）— {fiscal_year}年度 {quarter}Q　{status_text}</div>'
    f'<div style="font-size:1rem;line-height:1.7;color:#333;">{summary}</div></div>',
    unsafe_allow_html=True
)

# === 指導ポイント上位3つ ===
st.subheader("🎯 今回の指導ポイント")
coaching = get_coaching_points(review, previous)
if coaching:
    for i, cp in enumerate(coaching, 1):
        bg = "#f8d7da" if cp["priority"] == "high" else "#fff3cd"
        border = "#d62728" if cp["priority"] == "high" else "#ff7f0e"
        st.markdown(
            f'<div style="background:{bg};border-left:4px solid {border};border-radius:6px;'
            f'padding:0.6rem 1rem;margin-bottom:0.5rem;">'
            f'<strong>{i}. {cp["point"]}</strong><br>'
            f'<span style="font-size:0.85rem;color:#555;">{cp["reason"]}</span></div>',
            unsafe_allow_html=True
        )
else:
    st.markdown(
        '<div style="background:#d4edda;border-left:4px solid #2ca02c;border-radius:6px;padding:0.6rem 1rem;">'
        '特に優先度の高い指導ポイントはありません。継続支援を行ってください。</div>',
        unsafe_allow_html=True
    )

st.markdown("---")

# === 今回の要点 ===
st.subheader("📋 今回の要点")

col_act, col_eval = st.columns(2)
with col_act:
    st.markdown("**活動実績**")
    for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
        val = review.get(key, 0)
        prev_val = previous.get(key, 0) if previous else 0
        diff = val - prev_val
        if previous and diff != 0:
            color = "#2ca02c" if diff > 0 else "#d62728"
            arrow = f'<span style="color:{color};font-size:0.85rem;"> ({diff:+d})</span>'
        else:
            arrow = ""
        st.markdown(f"- {label}: **{val}件**{arrow}", unsafe_allow_html=True)

with col_eval:
    st.markdown("**自己評価**")
    for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
        val = review.get(key, 0)
        prev_val = previous.get(key, 0) if previous else None
        bars = "●" * val + "○" * (5 - val)
        diff_text = ""
        if previous and prev_val:
            diff = val - prev_val
            if diff > 0:
                diff_text = f' <span style="color:#2ca02c;">↑</span>'
            elif diff < 0:
                diff_text = f' <span style="color:#d62728;">↓</span>'
            else:
                diff_text = ' <span style="color:#999;">→</span>'
        st.markdown(f"- {label}: {bars}{diff_text}", unsafe_allow_html=True)

st.markdown("---")

# === グラフ ===
st.subheader("📊 グラフ分析")

tab1, tab2, tab3, tab4 = st.tabs(["🎯 レーダー", "📊 活動推移", "🔍 ギャップ", "⚖️ ���ランス"])

with tab1:
    col1, col2 = st.columns(2)
    with col1:
        fig = charts.radar_chart(review, "自己評価 / 指導者評価")
        st.plotly_chart(fig, use_container_width=True)
    with col2:
        if previous:
            fig2 = charts.radar_comparison(review, previous)
            st.plotly_chart(fig2, use_container_width=True)
        else:
            st.info("前回データがないため比較できません。")

with tab2:
    all_reviews = db.get_reviews_for_employee(emp_id)
    fig = charts.activity_trend_chart(all_reviews)
    st.plotly_chart(fig, use_container_width=True)

with tab3:
    gap_fig = charts.eval_gap_chart(review)
    if gap_fig:
        st.plotly_chart(gap_fig, use_container_width=True)
        gap_items = get_gap_items(review)
        if gap_items:
            st.markdown("**認識差が大きい項目:**")
            for g in gap_items:
                icon = "🔺" if g["diff"] > 0 else "🔻"
                bg = "#fff3cd"
                st.markdown(
                    f'<div style="background:{bg};border-radius:4px;padding:0.4rem 0.8rem;margin-bottom:0.3rem;">'
                    f'{icon} <strong>{g["label"]}</strong> — '
                    f'自己: {g["self"]} / 指導者: {g["sup"]}（差: {g["diff"]:+d}）… {g["note"]}</div>',
                    unsafe_allow_html=True
                )
    else:
        st.info("指導者評価が未入力のため表示できません。")

with tab4:
    fig = charts.activity_eval_balance(review)
    st.plotly_chart(fig, use_container_width=True)

st.markdown("---")

# === 前回比較（改善・維持・低下を色分け） ===
if previous:
    st.subheader("🔄 前回比較")

    # 自己評価の比較
    st.markdown("**自己評価の変化**")
    comp_data = []
    for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
        cur_v = review.get(key, 0)
        prev_v = previous.get(key, 0)
        diff = cur_v - prev_v
        if diff > 0:
            status = "📈 改善"
        elif diff < 0:
            status = "📉 低下"
        else:
            status = "→ 維持"
        comp_data.append({
            "項目": label,
            "前回": prev_v,
            "今回": cur_v,
            "変化": f"{diff:+d}" if diff != 0 else "—",
            "判定": status,
        })

    comp_df = pd.DataFrame(comp_data)

    def highlight_row(row):
        if "改善" in str(row["判定"]):
            return ["background-color: #d4edda"] * len(row)
        elif "低下" in str(row["判定"]):
            return ["background-color: #f8d7da"] * len(row)
        return [""] * len(row)

    styled = comp_df.style.apply(highlight_row, axis=1)
    st.dataframe(styled, use_container_width=True, hide_index=True)

    # 活動実績の比較
    st.markdown("**活動実績の変化**")
    act_comp = []
    for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
        cur_v = review.get(key, 0)
        prev_v = previous.get(key, 0)
        diff = cur_v - prev_v
        act_comp.append({
            "項目": label,
            "前回": f"{prev_v}件",
            "今回": f"{cur_v}件",
            "変化": f"{diff:+d}" if diff != 0 else "—",
        })
    st.dataframe(pd.DataFrame(act_comp), use_container_width=True, hide_index=True)

    # 重点実行項目の達成確認
    if previous.get("priority_action"):
        result = review.get("priority_action_result", "")
        if "達成" in result:
            bg, border = "#d4edda", "#2ca02c"
        elif "実施中" in result:
            bg, border = "#fff3cd", "#ff7f0e"
        else:
            bg, border = "#f8d7da", "#d62728"
        st.markdown(
            f'<div style="background:{bg};border-left:4px solid {border};border-radius:6px;'
            f'padding:0.6rem 1rem;margin:0.5rem 0;">'
            f'<strong>前回の重点実行項目:</strong> {previous["priority_action"]}<br>'
            f'<strong>達成状況:</strong> {result or "未確認"}</div>',
            unsafe_allow_html=True
        )

st.markdown("---")

# === 強み・弱み・指導優先 ===
st.subheader("💪 強み・弱み・指導優先ポイント")

col1, col2, col3 = st.columns(3)
with col1:
    st.markdown("**強み上位3項目**")
    for name, score in get_strengths(review):
        st.markdown(f'<div style="background:#d4edda;padding:0.4rem 0.8rem;border-radius:4px;margin-bottom:0.3rem;">'
                    f'✅ {name}（{score}）</div>', unsafe_allow_html=True)

with col2:
    st.markdown("**課題上位3項目**")
    for name, score in get_weaknesses(review):
        bg = "#f8d7da" if score <= 2 else "#fff3cd"
        st.markdown(f'<div style="background:{bg};padding:0.4rem 0.8rem;border-radius:4px;margin-bottom:0.3rem;">'
                    f'📌 {name}（{score}）</div>', unsafe_allow_html=True)

with col3:
    st.markdown("**指導優先ポイント**")
    priorities = get_priority_items(review)
    if priorities:
        for name, level, css_class in priorities:
            bg = "#f8d7da" if css_class == "danger" else "#fff3cd"
            st.markdown(f'<div style="background:{bg};padding:0.4rem 0.8rem;border-radius:4px;margin-bottom:0.3rem;">'
                        f'⚡ {name}（{level}）</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div style="background:#d4edda;padding:0.4rem 0.8rem;border-radius:4px;">特になし</div>',
                    unsafe_allow_html=True)

st.markdown("---")

# === 自動フィードバック補助 ===
st.subheader("🤖 自動フィードバック補助")
st.caption("入力データから自動生成されたコメントです。面談時の参考としてご活用ください。")

feedback = generate_feedback(review, previous)

col_good, col_caution, col_next = st.columns(3)

with col_good:
    st.markdown("**✅ 良い点**")
    for item in feedback["good"]:
        st.markdown(
            f'<div style="background:#d4edda;border-left:3px solid #2ca02c;padding:0.5rem 0.8rem;'
            f'border-radius:4px;margin-bottom:0.5rem;font-size:0.9rem;line-height:1.5;">'
            f'{item}</div>', unsafe_allow_html=True
        )

with col_caution:
    st.markdown("**⚠️ 注意点**")
    if feedback["caution"]:
        for item in feedback["caution"]:
            is_critical = "最優先" in item or "コンプライアンス" in item
            bg = "#f8d7da" if is_critical else "#fff3cd"
            st.markdown(
                f'<div style="background:{bg};border-left:3px solid #ff7f0e;padding:0.5rem 0.8rem;'
                f'border-radius:4px;margin-bottom:0.5rem;font-size:0.9rem;line-height:1.5;">'
                f'{item}</div>', unsafe_allow_html=True
            )
    else:
        st.markdown("特になし")

with col_next:
    st.markdown("**🎯 次回重点**")
    for item in feedback["next_focus"]:
        is_critical = "最優先" in item
        bg = "#f8d7da" if is_critical else "#e3f2fd"
        st.markdown(
            f'<div style="background:{bg};border-left:3px solid #1f77b4;padding:0.5rem 0.8rem;'
            f'border-radius:4px;margin-bottom:0.5rem;font-size:0.9rem;line-height:1.5;">'
            f'{item}</div>', unsafe_allow_html=True
        )

st.markdown("---")

# === 記述内容 ===
st.subheader("📝 振り返り記述")
desc_items = [
    ("今期うまくいったこと", review.get("success_note", ""), "#d4edda"),
    ("今期苦戦したこと", review.get("challenge_note", ""), "#fff3cd"),
    ("原因の自己分析", review.get("analysis_note", ""), "#f8f9fa"),
    ("次回の改善行動", review.get("improvement_plan", ""), "#e3f2fd"),
]
for title, content, bg in desc_items:
    if content:
        st.markdown(
            f'<div style="margin-bottom:0.8rem;">'
            f'<div style="font-weight:bold;margin-bottom:0.3rem;">{title}</div>'
            f'<div style="background:{bg};padding:0.6rem 1rem;border-radius:6px;'
            f'line-height:1.7;white-space:pre-wrap;">{content}</div></div>',
            unsafe_allow_html=True
        )

st.markdown("---")

# === 指導者コメント記入欄 ===
st.subheader("✍️ 指導者コメント")
st.caption("社員への声かけとして使える表現を意識してください。高圧的にならない配慮をお願いします。")

with st.form("feedback_comment"):
    supervisor_comment = st.text_area(
        "指導者コメント",
        value=review.get("supervisor_comment", ""),
        placeholder="例: ○○の取り組みが着実に成果につながっています。次は△△にも少し意識を向けてみると、さらに伸びると思います。",
        height=120,
    )
    next_focus = st.text_area(
        "次回面談で重点的に確認すること",
        value=review.get("next_focus", ""),
        height=80,
    )
    coaching_memo = st.text_area(
        "指導メモ（内部用・社員には非公開）",
        value=review.get("coaching_memo", ""),
        height=80,
    )

    if st.form_submit_button("💾 コメントを保存", type="primary", use_container_width=True):
        review["supervisor_comment"] = supervisor_comment
        review["next_focus"] = next_focus
        review["coaching_memo"] = coaching_memo
        db.save_review(review)
        st.success("コメントを保存しました。")

st.markdown("---")

# === 印刷 ===
st.caption("🖨️ ブラウザの印刷機能（Ctrl+P / Cmd+P）で印刷できます。サイドバーと入力欄は印刷時に非表示になります。")
