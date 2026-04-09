"""
営業指導 四半期振り返り・フィードバックアプリ
メイン画面：ダッシュボード（改善版）

改善点:
- 所属・年度フィルタを上部に統合
- 提出状況をカード表示
- コンプライアンス低評価者を優先表示
- 改善傾向の強い社員も表示
- 全体傾向の見せ方改善
"""

import streamlit as st
import sys
import datetime
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from lib import database as db
from lib.feedback_engine import get_priority_items, get_strengths, get_weaknesses, generate_summary
from lib.charts import EVAL_KEYS_SELF, EVAL_KEYS_SUP, ACTIVITY_KEYS, EVAL_LABELS, ACTIVITY_LABELS

# --- ページ設定 ---
st.set_page_config(
    page_title="四半期振り返り・フィードバック",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- カスタムCSS ---
st.markdown("""
<style>
    .block-container { padding-top: 1rem; }
    .metric-card {
        background: #f8f9fa; border-radius: 8px; padding: 1rem 1.2rem;
        border-left: 4px solid #1f77b4; margin-bottom: 0.5rem;
    }
    .metric-card.warning { border-left-color: #ff7f0e; background: #fff8f0; }
    .metric-card.danger { border-left-color: #d62728; background: #fff0f0; }
    .metric-card.success { border-left-color: #2ca02c; background: #f0fff0; }
    .metric-card.info { border-left-color: #17becf; background: #f0f8ff; }
    .summary-card {
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-radius: 10px; padding: 1.2rem 1.5rem; margin-bottom: 1rem;
        border: 1px solid #dee2e6;
    }
    .privacy-notice {
        background: #fff3cd; border: 1px solid #ffc107;
        border-radius: 6px; padding: 0.6rem 1rem; font-size: 0.85rem; margin-bottom: 1rem;
    }
    .section-divider { border-top: 2px solid #e9ecef; margin: 1.5rem 0; }
    [data-testid="stSidebar"] { min-width: 260px; }
    h1 { font-size: 1.6rem !important; }
    h2 { font-size: 1.3rem !important; }
    h3 { font-size: 1.1rem !important; }
</style>
""", unsafe_allow_html=True)

# --- サンプルデータ投入 ---
db.seed_sample_data()

# --- サイドバー ---
st.sidebar.title("📊 振り返りアプリ")
st.sidebar.caption("営業指導用 四半期振り返り・フィードバック")
st.sidebar.markdown("---")
st.sidebar.markdown("**ページ一覧**")
st.sidebar.page_link("app.py", label="🏠 ダッシュボード")
st.sidebar.page_link("pages/01_社員管��.py", label="👥 社員管理")
st.sidebar.page_link("pages/02_四半期入力.py", label="📝 四半期入力")
st.sidebar.page_link("pages/03_社員詳細.py", label="👤 社員詳細")
st.sidebar.page_link("pages/04_フィードバック.py", label="💬 フィードバック")
st.sidebar.page_link("pages/05_年間サマリー.py", label="📈 年間サマリー")
st.sidebar.markdown("---")
st.sidebar.markdown(
    '<div class="privacy-notice">⚠️ 顧客情報（氏名・証券番号・契約番号等）は入力しないでください。本アプリは営業指導用の内部振り返り専用です。</div>',
    unsafe_allow_html=True
)

# --- メインコンテンツ ---
st.title("🏠 ダッシュボード")
st.markdown(
    '<div class="privacy-notice">⚠️ 本アプリは営業指導の内部振り返り専用です。顧客情報（氏名・証券番号・契約番号等）は入力しないでください。</div>',
    unsafe_allow_html=True
)

# データ取得
employees = db.get_all_employees()
all_reviews = db.get_all_reviews()
latest_reviews = db.get_latest_reviews()

if not employees:
    st.info("社員が登録されていません。「社員管理」ページから社員を登録してください。")
    st.stop()

# === フィルタ ===
current_year = datetime.date.today().year
fcol1, fcol2, fcol3 = st.columns(3)
with fcol1:
    departments = sorted(set(e["department"] for e in employees if e["department"]))
    dept_filter = st.selectbox("所属", ["すべて"] + departments, key="dash_dept")
with fcol2:
    sel_year = st.selectbox("年度", list(range(current_year + 1, current_year - 5, -1)), key="dash_year")
with fcol3:
    sel_quarter = st.selectbox("四半期", [1, 2, 3, 4], format_func=lambda x: f"{x}Q", key="dash_quarter")

# フィルタ適用
filtered_employees = employees
if dept_filter != "すべて":
    filtered_employees = [e for e in employees if e["department"] == dept_filter]
filtered_emp_ids = {e["id"] for e in filtered_employees}

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 提出状況カード ===
status_list = db.get_submission_status(sel_year, sel_quarter)
# フィルタ適用
status_list = [s for s in status_list if s["employee_id"] in filtered_emp_ids]

submitted_count = sum(1 for s in status_list if s["status"] == "submitted")
draft_count = sum(1 for s in status_list if s["status"] == "draft")
not_submitted_count = sum(1 for s in status_list if s["status"] == "未提出")
total_count = len(status_list)

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("対象社員", f"{total_count}名")
with col2:
    st.metric("提出済", f"{submitted_count}名",
              delta=f"{submitted_count}/{total_count}" if total_count > 0 else None)
with col3:
    st.metric("下書き", f"{draft_count}名")
with col4:
    delta_color = "inverse" if not_submitted_count > 0 else "off"
    st.metric("未提出", f"{not_submitted_count}名",
              delta=f"要確認" if not_submitted_count > 0 else None,
              delta_color=delta_color)

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === コンプライアンス警告（最優先表示） ===
compliance_alerts = []
for r in latest_reviews:
    if r["employee_id"] not in filtered_emp_ids:
        continue
    comp_self = r.get("self_compliance", 0)
    comp_sup = r.get("sup_compliance", 0)
    if comp_self <= 2 or (comp_sup > 0 and comp_sup <= 2):
        compliance_alerts.append(r)

if compliance_alerts:
    st.subheader("🚨 コンプライアンス要注意")
    st.caption("成果面よりも先に、募集品質・説明品質の確認が必要な社員です。")
    for r in compliance_alerts:
        comp_detail = f"自己評価: {r.get('self_compliance', 0)}"
        if r.get("sup_compliance", 0) > 0:
            comp_detail += f" / 指導者評価: {r['sup_compliance']}"
        st.markdown(
            f'<div class="metric-card danger">'
            f'<strong>{r.get("employee_name", "")}</strong>（{r.get("department", "")}）'
            f'— {r["fiscal_year"]}年度{r["quarter"]}Q<br>'
            f'<span style="font-size:0.9rem;">コンプライアンス意識: {comp_detail}</span></div>',
            unsafe_allow_html=True
        )
    st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 要フォロー社員 ===
st.subheader("🔔 要フォロー社員")

need_follow = []
for r in latest_reviews:
    if r["employee_id"] not in filtered_emp_ids:
        continue
    priorities = get_priority_items(r)
    if priorities:
        has_critical = any(p[2] == "danger" for p in priorities)
        # コンプラ警告は上で出しているので、ここでは除外
        non_compliance_priorities = [p for p in priorities if "コンプライアンス" not in p[0]]
        if non_compliance_priorities:
            need_follow.append({
                "name": r.get("employee_name", ""),
                "department": r.get("department", ""),
                "period": f"{r['fiscal_year']}年度{r['quarter']}Q",
                "priorities": non_compliance_priorities,
                "critical": has_critical,
            })

# 未入力社員も要フォロー
reviewed_ids = {r["employee_id"] for r in latest_reviews}
for e in filtered_employees:
    if e["id"] not in reviewed_ids:
        need_follow.append({
            "name": e["name"],
            "department": e.get("department", ""),
            "period": "データなし",
            "priorities": [("振り返り未入力", "要確認", "warning")],
            "critical": False,
        })

need_follow.sort(key=lambda x: (not x["critical"], x["name"]))

if need_follow:
    for item in need_follow:
        css_class = "danger" if item["critical"] else "warning"
        priority_tags = " / ".join([f"**{p[0]}**（{p[1]}）" for p in item["priorities"]])
        st.markdown(
            f'<div class="metric-card {css_class}">'
            f'<strong>{item["name"]}</strong>（{item["department"]}）— {item["period"]}<br>'
            f'<span style="font-size:0.9rem;">{priority_tags}</span></div>',
            unsafe_allow_html=True
        )
else:
    st.markdown('<div class="metric-card success">現在、緊急のフォロー対象はありません。</div>', unsafe_allow_html=True)

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 改善傾向の強い社員 ===
st.subheader("📈 改善傾向が見られる社員")
improved_employees = []
for r in latest_reviews:
    if r["employee_id"] not in filtered_emp_ids:
        continue
    prev = db.get_previous_review(r["employee_id"], r["fiscal_year"], r["quarter"])
    if not prev:
        continue
    improved_count = 0
    improved_items = []
    for i, k in enumerate(EVAL_KEYS_SELF):
        diff = r.get(k, 0) - prev.get(k, 0)
        if diff >= 1:
            improved_count += 1
            improved_items.append(EVAL_LABELS[i])
    prev_total = sum(prev.get(k, 0) for k in ACTIVITY_KEYS)
    cur_total = sum(r.get(k, 0) for k in ACTIVITY_KEYS)
    act_improved = cur_total - prev_total >= 10

    if improved_count >= 2 or (improved_count >= 1 and act_improved):
        improved_employees.append({
            "name": r.get("employee_name", ""),
            "department": r.get("department", ""),
            "items": improved_items,
            "act_diff": cur_total - prev_total,
            "count": improved_count,
        })

improved_employees.sort(key=lambda x: x["count"], reverse=True)

if improved_employees:
    for emp_info in improved_employees:
        items_text = "、".join(emp_info["items"][:3])
        act_text = f"（活動量 +{emp_info['act_diff']}件）" if emp_info["act_diff"] > 0 else ""
        st.markdown(
            f'<div class="metric-card success">'
            f'<strong>{emp_info["name"]}</strong>（{emp_info["department"]}）<br>'
            f'<span style="font-size:0.9rem;">改善項目: {items_text}{act_text}</span></div>',
            unsafe_allow_html=True
        )
else:
    st.caption("今回の対象範囲で、顕著な改善傾向が検出された社員はいません。")

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 提出状況一覧 ===
st.subheader(f"📋 {sel_year}年度 {sel_quarter}Q 提出状況")
if status_list:
    status_df = pd.DataFrame(status_list)

    # 状態を日本語に変換
    status_map = {"submitted": "✅ 提出済", "draft": "📝 下書き", "未提出": "❌ 未提出"}
    status_df["状態表示"] = status_df["status"].map(lambda x: status_map.get(x, x))

    display_df = status_df[["name", "department", "状態表示"]].copy()
    display_df.columns = ["社員名", "所属", "状態"]

    def status_color(val):
        if "提出済" in str(val):
            return "background-color: #d4edda"
        elif "下書き" in str(val):
            return "background-color: #fff3cd"
        elif "未提出" in str(val):
            return "background-color: #f8d7da"
        return ""

    styled = display_df.style.map(status_color, subset=["状態"])
    st.dataframe(styled, use_container_width=True, hide_index=True)

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 全体傾向 ===
st.subheader("📊 全体傾向（最新四半期）")

filtered_latest = [r for r in latest_reviews if r["employee_id"] in filtered_emp_ids]

if filtered_latest:
    eval_avgs = {}
    for i, k in enumerate(EVAL_KEYS_SELF):
        vals = [r.get(k, 0) for r in filtered_latest if r.get(k, 0) > 0]
        eval_avgs[EVAL_LABELS[i]] = np.mean(vals) if vals else 0

    activity_avgs = {}
    for i, k in enumerate(ACTIVITY_KEYS):
        vals = [r.get(k, 0) for r in filtered_latest]
        activity_avgs[ACTIVITY_LABELS[i]] = np.mean(vals) if vals else 0

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**自己評価 全体平均**")
        for label, avg in eval_avgs.items():
            bar_width = int(avg / 5 * 100)
            color = "#2ca02c" if avg >= 4 else ("#ff7f0e" if avg >= 3 else "#d62728")
            st.markdown(
                f'<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">'
                f'<span style="min-width:120px;font-size:0.9rem;">{label}</span>'
                f'<div style="flex:1;background:#eee;border-radius:4px;height:10px;">'
                f'<div style="background:{color};border-radius:4px;height:10px;width:{bar_width}%;"></div></div>'
                f'<span style="min-width:30px;font-weight:bold;font-size:0.9rem;">{avg:.1f}</span></div>',
                unsafe_allow_html=True
            )

    with col2:
        st.markdown("**活動量 全体平均**")
        for label, avg in activity_avgs.items():
            st.markdown(f"- {label}: **{avg:.1f}** 件")

        st.markdown("")
        sorted_evals = sorted(eval_avgs.items(), key=lambda x: x[1], reverse=True)
        if len(sorted_evals) >= 2:
            st.markdown("**全体傾向**")
            st.markdown(f"✅ 強み: {sorted_evals[0][0]}（{sorted_evals[0][1]:.1f}）、{sorted_evals[1][0]}（{sorted_evals[1][1]:.1f}）")
            st.markdown(f"📌 課題: {sorted_evals[-1][0]}（{sorted_evals[-1][1]:.1f}）、{sorted_evals[-2][0]}（{sorted_evals[-2][1]:.1f}）")

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)

# === 社員一覧 ===
st.subheader("👥 社員一覧")

for emp in filtered_employees:
    emp_reviews = [r for r in filtered_latest if r.get("employee_id") == emp["id"]]
    latest = emp_reviews[0] if emp_reviews else None

    with st.container():
        cols = st.columns([3, 2, 2, 2, 2])
        with cols[0]:
            st.markdown(f"**{emp['name']}**")
            st.caption(f"{emp.get('department', '')} / 経験{emp.get('experience_years', 0)}年")
        with cols[1]:
            if latest:
                status_text = "✅ 提出済" if latest["status"] == "submitted" else "📝 下書き"
                st.markdown(f"{latest['fiscal_year']}年度{latest['quarter']}Q")
                st.caption(status_text)
            else:
                st.caption("❌ データなし")
        with cols[2]:
            if latest:
                avg = sum(latest.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
                st.metric("自己評価", f"{avg:.1f}", label_visibility="collapsed")
        with cols[3]:
            if latest:
                total = sum(latest.get(k, 0) for k in ACTIVITY_KEYS)
                st.metric("活動計", f"{total}件", label_visibility="collapsed")
        with cols[4]:
            if latest:
                priorities = get_priority_items(latest)
                if priorities:
                    p = priorities[0]
                    color = "#d62728" if p[2] == "danger" else "#ff7f0e"
                    st.markdown(f'<span style="color:{color};font-size:0.85rem;">{p[0]}（{p[1]}）</span>', unsafe_allow_html=True)
        st.markdown("<hr style='margin:0.2rem 0;border-color:#eee;'>", unsafe_allow_html=True)
