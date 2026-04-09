"""年間サマリーページ（改善版）

改善点:
- 社員横断比較テーブル
- 傾向矢印で変化が一目でわかる
- CSV列順・見出しの整理
- 簡易CSVと詳細CSVの切り分け
"""

import streamlit as st
import sys
import datetime
import pandas as pd
import numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib import database as db
from lib import charts
from lib.export import reviews_to_dataframe, reviews_to_simple_dataframe, employees_to_dataframe, export_all_data
from lib.feedback_engine import get_strengths, get_weaknesses
from lib.charts import EVAL_LABELS, EVAL_KEYS_SELF, ACTIVITY_LABELS, ACTIVITY_KEYS

st.set_page_config(page_title="年間サマリー", page_icon="📈", layout="wide")

st.title("📈 年間サマリー")
st.caption("年間推移の確認・社員比較・CSVエクスポート")

employees = db.get_all_employees()
all_reviews = db.get_all_reviews()

if not employees:
    st.warning("社員が登録されていません。")
    st.stop()

# --- フィルタ ---
st.subheader("🔍 フィルタ")
filter_cols = st.columns(4)
with filter_cols[0]:
    departments = sorted(set(e["department"] for e in employees if e["department"]))
    dept_filter = st.selectbox("所属", ["すべて"] + departments)
with filter_cols[1]:
    years = sorted(set(r["fiscal_year"] for r in all_reviews), reverse=True) if all_reviews else []
    year_filter = st.selectbox("年度", ["すべて"] + years)
with filter_cols[2]:
    quarter_filter = st.selectbox("四半期", ["すべて", 1, 2, 3, 4],
                                  format_func=lambda x: f"{x}Q" if isinstance(x, int) else x)
with filter_cols[3]:
    emp_filter_options = ["すべて"] + [e["name"] for e in employees]
    emp_filter = st.selectbox("社員", emp_filter_options)

# フィルタ適用
filtered_reviews = all_reviews
if dept_filter != "すべて":
    filtered_reviews = [r for r in filtered_reviews if r.get("department") == dept_filter]
if year_filter != "すべて":
    filtered_reviews = [r for r in filtered_reviews if r["fiscal_year"] == year_filter]
if quarter_filter != "すべて":
    filtered_reviews = [r for r in filtered_reviews if r["quarter"] == quarter_filter]
if emp_filter != "すべて":
    filtered_reviews = [r for r in filtered_reviews if r.get("employee_name") == emp_filter]

st.markdown("---")

# === 社員横断比較（最新四半期） ===
st.subheader("👥 社員横断比較")
st.caption("フィルタ条件に合う最新データでの横断比較です。")

if filtered_reviews:
    # 各社員の最新データを取得
    latest_by_emp = {}
    for r in filtered_reviews:
        ename = r.get("employee_name", "")
        key = (r["fiscal_year"], r["quarter"])
        if ename not in latest_by_emp or key > (latest_by_emp[ename]["fiscal_year"], latest_by_emp[ename]["quarter"]):
            latest_by_emp[ename] = r

    if latest_by_emp:
        compare_rows = []
        for ename, r in sorted(latest_by_emp.items()):
            total_act = sum(r.get(k, 0) for k in ACTIVITY_KEYS)
            avg_self = sum(r.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
            comp_val = r.get("self_compliance", 0)

            # 前回比較
            prev = db.get_previous_review(r["employee_id"], r["fiscal_year"], r["quarter"])
            trend = ""
            if prev:
                prev_avg = sum(prev.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
                diff = avg_self - prev_avg
                if diff > 0.3:
                    trend = "📈 改善"
                elif diff < -0.3:
                    trend = "📉 低下"
                else:
                    trend = "→ 維持"

            strengths = get_strengths(r, 1)
            weaknesses = get_weaknesses(r, 1)

            compare_rows.append({
                "社員名": ename,
                "所属": r.get("department", ""),
                "期間": f"{r['fiscal_year']}年度{r['quarter']}Q",
                "活動計": total_act,
                "自己評価": f"{avg_self:.1f}",
                "傾向": trend,
                "コンプラ": f"{'⚠️ ' if comp_val <= 2 else ''}{comp_val}",
                "強み": strengths[0][0] if strengths else "",
                "課題": weaknesses[0][0] if weaknesses else "",
                "成約": r.get("contract_count", 0),
            })

        compare_df = pd.DataFrame(compare_rows)
        st.dataframe(compare_df, use_container_width=True, hide_index=True)

st.markdown("---")

# --- 年間推移一覧 ---
st.subheader("📊 年間推移一覧")

if not filtered_reviews:
    st.info("条件に合うデータがありません。")
else:
    table_rows = []
    for r in filtered_reviews:
        total_act = sum(r.get(k, 0) for k in ACTIVITY_KEYS)
        avg_self = sum(r.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
        status_map = {"submitted": "✅ 提出済", "draft": "📝 下書き"}
        table_rows.append({
            "社員名": r.get("employee_name", ""),
            "所属": r.get("department", ""),
            "期間": f"{r['fiscal_year']}年度{r['quarter']}Q",
            "状態": status_map.get(r.get("status", ""), ""),
            "活動計": total_act,
            "自己評価": f"{avg_self:.1f}",
            "成約": r.get("contract_count", 0),
            "重点項目": r.get("priority_action", "") or "—",
        })

    df = pd.DataFrame(table_rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

    st.markdown("---")

    # --- 社員ごとの年間サマリー ---
    st.subheader("👤 社員別 年間サマリー")

    if emp_filter != "すべて":
        target_employees = [e for e in employees if e["name"] == emp_filter]
    elif dept_filter != "すべて":
        target_employees = [e for e in employees if e["department"] == dept_filter]
    else:
        target_employees = employees

    for emp in target_employees:
        emp_reviews = [r for r in filtered_reviews if r.get("employee_name") == emp["name"]]
        if not emp_reviews:
            continue

        # 時系列でソート
        emp_reviews.sort(key=lambda r: (r["fiscal_year"], r["quarter"]))
        latest = emp_reviews[-1]
        total_act = sum(latest.get(k, 0) for k in ACTIVITY_KEYS)
        avg_self = sum(latest.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)

        # 期間全体の変化サマリー
        change_summary = ""
        if len(emp_reviews) >= 2:
            first = emp_reviews[0]
            first_avg = sum(first.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
            diff = avg_self - first_avg
            if diff > 0:
                change_summary = f"📈 評価 +{diff:.1f}"
            elif diff < 0:
                change_summary = f"📉 評価 {diff:.1f}"

        with st.expander(
            f"📋 {emp['name']}（{emp['department']}）— {len(emp_reviews)}期分　"
            f"活動計{total_act}件 / 評価{avg_self:.1f}　{change_summary}",
            expanded=False
        ):
            fig = charts.activity_trend_chart(emp_reviews, f"{emp['name']} 活動実績推移")
            st.plotly_chart(fig, use_container_width=True)

            fig2 = charts.eval_trend_chart(emp_reviews, f"{emp['name']} 自己評価推移")
            st.plotly_chart(fig2, use_container_width=True)

            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**最新の強み**")
                for name, score in get_strengths(latest):
                    st.markdown(f"- ✅ {name}（{score}）")
            with col2:
                st.markdown("**最新の課題**")
                for name, score in get_weaknesses(latest):
                    st.markdown(f"- 📌 {name}（{score}）")

            if len(emp_reviews) >= 2:
                first = emp_reviews[0]
                st.markdown("**期間全体の変化**")
                changes = []
                for i, k in enumerate(EVAL_KEYS_SELF):
                    diff = latest.get(k, 0) - first.get(k, 0)
                    if diff != 0:
                        icon = "📈" if diff > 0 else "📉"
                        changes.append(f"{icon} {EVAL_LABELS[i]}({diff:+d})")
                if changes:
                    st.markdown("　".join(changes))
                else:
                    st.caption("評価に変化なし")

st.markdown("---")

# --- CSVエクスポート ---
st.subheader("📥 CSVエクスポート")

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown("**簡易データ**")
    st.caption("活動合計・評価平均・重点項目")
    if filtered_reviews:
        simple_df = reviews_to_simple_dataframe(filtered_reviews, employees)
        csv_data = simple_df.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            label="📥 簡易CSV",
            data=csv_data,
            file_name=f"reviews_simple_{datetime.date.today()}.csv",
            mime="text/csv",
            use_container_width=True,
        )

with col2:
    st.markdown("**詳細データ**")
    st.caption("全項目（フィルタ済み）")
    if filtered_reviews:
        full_df = reviews_to_dataframe(filtered_reviews, employees)
        csv_data = full_df.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            label="📥 詳細CSV",
            data=csv_data,
            file_name=f"reviews_detail_{datetime.date.today()}.csv",
            mime="text/csv",
            use_container_width=True,
        )

with col3:
    st.markdown("**全データ**")
    st.caption("全期間・全社員")
    all_df = export_all_data()
    if not all_df.empty:
        all_csv = all_df.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            label="📥 全データCSV",
            data=all_csv,
            file_name=f"all_reviews_{datetime.date.today()}.csv",
            mime="text/csv",
            use_container_width=True,
        )

with col4:
    st.markdown("**社員マスタ**")
    st.caption("社員情報のみ")
    emp_df = employees_to_dataframe(employees)
    if not emp_df.empty:
        emp_csv = emp_df.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            label="📥 社員CSV",
            data=emp_csv,
            file_name=f"employees_{datetime.date.today()}.csv",
            mime="text/csv",
            use_container_width=True,
        )

st.markdown("---")
st.caption("💡 CSVファイルはExcelで開けます（UTF-8 BOM付き）。バックアップや他システムへの移行にもご活用ください。")
