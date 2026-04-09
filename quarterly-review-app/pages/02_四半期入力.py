"""四半期データ入力ページ（改善版）

改善点:
- セクションを明確に区分（見出し + expander）
- 前回値とのインライン差分表示
- コンプライアンス低評価時の警告
- 保存前確認エリア
- 下書き保存しやすいUI
"""

import streamlit as st
import sys
import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib import database as db
from lib.charts import EVAL_LABELS, EVAL_KEYS_SELF, EVAL_KEYS_SUP, ACTIVITY_LABELS, ACTIVITY_KEYS

st.set_page_config(page_title="四半期入力", page_icon="📝", layout="wide")

st.title("📝 四半期振り返り入力")

st.markdown(
    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:0.6rem 1rem;font-size:0.85rem;margin-bottom:1rem;">'
    '⚠️ 顧客情報（氏名・証券番号・契約番号等）は入力しないでください。本フォームは営業指導の内部振り返り専用です。</div>',
    unsafe_allow_html=True
)

employees = db.get_all_employees()
if not employees:
    st.warning("社員が登録されていません。「社員管理」ページから追加してください。")
    st.stop()

# === セクション1: 基本情報（対象選択） ===
st.subheader("1. 対象の選択")
col1, col2, col3 = st.columns(3)
with col1:
    emp_options = {f"{e['name']}（{e['department']}）": e["id"] for e in employees}
    selected_emp_label = st.selectbox("社員", list(emp_options.keys()))
    emp_id = emp_options[selected_emp_label]
with col2:
    current_year = datetime.date.today().year
    fiscal_year = st.selectbox("年度", list(range(current_year + 1, current_year - 5, -1)))
with col3:
    quarter = st.selectbox("四半期", [1, 2, 3, 4], format_func=lambda x: f"{x}Q")

existing = db.get_review(emp_id, fiscal_year, quarter)
previous = db.get_previous_review(emp_id, fiscal_year, quarter)

if existing:
    status_label = "提出済" if existing["status"] == "submitted" else "下書き"
    st.info(f"📄 {fiscal_year}年度{quarter}Qのデータが存在します（{status_label}）。編集できます。")

# 前回データ参考
if previous:
    with st.expander(f"📋 前回データ参考（{previous['fiscal_year']}年度{previous['quarter']}Q）", expanded=False):
        pcol1, pcol2, pcol3 = st.columns(3)
        with pcol1:
            st.markdown("**活動実績**")
            for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
                st.caption(f"{label}: {previous.get(key, 0)} 件")
        with pcol2:
            st.markdown("**自己評価**")
            for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
                v = previous.get(key, 0)
                st.caption(f"{label}: {'●' * v}{'○' * (5 - v)} ({v})")
        with pcol3:
            st.markdown("**重点実行項目**")
            st.caption(previous.get("priority_action", "なし") or "なし")
            if previous.get("supervisor_comment"):
                st.markdown("**前回指導者コメント**")
                st.caption(previous["supervisor_comment"][:80])

st.markdown("---")

# === メイン入力フォーム ===
with st.form("quarterly_input", clear_on_submit=False):

    # === セクション2: 活動実績 ===
    st.subheader("2. 活動実績（数値）")
    st.caption("各項目の件数を入力してください。0件の場合は0のまま保存されます。")

    act_cols = st.columns(3)
    activity_values = {}
    for i, (key, label) in enumerate(zip(ACTIVITY_KEYS, ACTIVITY_LABELS)):
        with act_cols[i % 3]:
            default = existing.get(key, 0) if existing else 0
            prev_val = previous.get(key, 0) if previous else None

            # 前回差分ヘルプ表示
            help_text = f"前回: {prev_val}件" if prev_val is not None else None
            activity_values[key] = st.number_input(
                f"{label}（件）", min_value=0, max_value=999,
                value=default, step=1, key=f"act_{key}", help=help_text
            )

    # 活動合計を即時表示
    total_act = sum(activity_values.values())
    st.caption(f"活動合計: **{total_act}件**" + (f"（前回: {sum(previous.get(k, 0) for k in ACTIVITY_KEYS)}件）" if previous else ""))

    st.markdown("---")

    # === セクション3: 自己評価 ===
    st.subheader("3. 行動・姿勢の自己評価（5段階）")
    st.caption("1: まだ十分でない ← → 5: 十分にできている　※ 自分の感覚で正直に評価してください")

    self_values = {}
    eval_cols = st.columns(2)
    for i, (key, label) in enumerate(zip(EVAL_KEYS_SELF, EVAL_LABELS)):
        with eval_cols[i % 2]:
            default = existing.get(key, 3) if existing else 3
            prev_val = previous.get(key, 0) if previous else None
            help_text = f"前回: {prev_val}" if prev_val else None
            self_values[key] = st.slider(
                label, min_value=1, max_value=5,
                value=default, step=1, key=f"self_{key}", help=help_text
            )

    # コンプライアンス警告
    if self_values.get("self_compliance", 3) <= 2:
        st.warning("⚠️ コンプライアンス意識の自己評価が低い状態です。"
                  "成果面の取り組みよりも先に、募集品質・説明品質の改善を優先的に確認してください。")

    st.markdown("---")

    # === セクション4: 指導者評価 ===
    st.subheader("4. 指導者評価（5段階）")
    st.caption("指導者が評価を入力する場合に使用してください。0＝未評価（入力不要）として扱います。")

    sup_values = {}
    sup_cols = st.columns(2)
    for i, (key, label) in enumerate(zip(EVAL_KEYS_SUP, EVAL_LABELS)):
        with sup_cols[i % 2]:
            default = existing.get(key, 0) if existing else 0
            sup_values[key] = st.slider(
                f"[指導者] {label}", min_value=0, max_value=5,
                value=default, step=1, key=f"sup_{key}", help="0=未評価"
            )

    st.markdown("---")

    # === セクション5: 振り返り記述 ===
    st.subheader("5. 振り返り記述")
    st.caption("具体的なエピソードを交えて記入すると、指導に活かしやすくなります。")

    success_note = st.text_area(
        "今期うまくいったこと",
        value=existing.get("success_note", "") if existing else "",
        placeholder="成功体験や手応えを感じた場面を記入してください",
        height=90, key="success"
    )
    challenge_note = st.text_area(
        "今期苦戦したこと",
        value=existing.get("challenge_note", "") if existing else "",
        placeholder="難しかったこと、うまくいかなかったことを記入してください",
        height=90, key="challenge"
    )
    analysis_note = st.text_area(
        "原因の自己分析",
        value=existing.get("analysis_note", "") if existing else "",
        placeholder="苦戦の原因として、自分なりに思い当たることを記入してください",
        height=90, key="analysis"
    )
    improvement_plan = st.text_area(
        "次回の改善行動",
        value=existing.get("improvement_plan", "") if existing else "",
        placeholder="次の四半期で具体的に取り組みたいことを記入してください",
        height=90, key="improvement"
    )

    st.markdown("---")

    # === セクション6: 指導者記入欄 ===
    st.subheader("6. 指導者記入欄")
    st.caption("社員への声かけの参考として記入してください。高圧的にならない表現を意識しましょう。")

    supervisor_comment = st.text_area(
        "指導者コメント",
        value=existing.get("supervisor_comment", "") if existing else "",
        placeholder="例: ○○の取り組みが成果につながっています。次は△△にも少し意識を向けてみましょう。",
        height=100, key="sup_comment"
    )
    next_focus = st.text_area(
        "次回面談で重点的に確認すること",
        value=existing.get("next_focus", "") if existing else "",
        placeholder="次回の面談時に確認したいポイント",
        height=80, key="next_focus"
    )

    st.markdown("---")

    # === セクション7: 次回アクション ===
    st.subheader("7. 重点実行項目・達成確認")

    priority_action = st.text_input(
        "次回までの重点実行項目（1つ）",
        value=existing.get("priority_action", "") if existing else "",
        placeholder="次の四半期までに必ず取り組む1つのアクション",
        key="priority_action"
    )

    # 前回重点項目の達成確認
    if previous and previous.get("priority_action"):
        st.markdown(
            f'<div style="background:#e3f2fd;border-radius:6px;padding:0.6rem 1rem;margin:0.5rem 0;">'
            f'📌 <strong>前回の重点実行項目:</strong> {previous["priority_action"]}</div>',
            unsafe_allow_html=True
        )
        result_options = ["", "達成", "概ね達成", "一部達成", "実施中", "未達"]
        current_result = existing.get("priority_action_result", "") if existing else ""
        idx = result_options.index(current_result) if current_result in result_options else 0
        priority_action_result = st.selectbox(
            "前回の重点実行項目の達成状況", result_options, index=idx, key="priority_result"
        )
    else:
        priority_action_result = existing.get("priority_action_result", "") if existing else ""

    st.markdown("---")

    # === 指導メモ ===
    coaching_memo = st.text_area(
        "指導メモ（指導者用の内部メモ・社員には非公開）",
        value=existing.get("coaching_memo", "") if existing else "",
        placeholder="指導上の気づきや、次回面談で確認すべき事項など",
        height=80, key="coaching_memo"
    )

    st.markdown("---")

    # === 保存前確認エリア ===
    st.subheader("📋 保存前確認")
    st.caption("入力内容の要点です。確認のうえ保存してください。")

    confirm_cols = st.columns(3)
    with confirm_cols[0]:
        st.markdown("**活動実績**")
        for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
            val = activity_values[key]
            diff_text = ""
            if previous:
                diff = val - previous.get(key, 0)
                if diff > 0:
                    diff_text = f" (+{diff})"
                elif diff < 0:
                    diff_text = f" ({diff})"
            st.caption(f"{label}: {val}件{diff_text}")

    with confirm_cols[1]:
        st.markdown("**自己評価**")
        for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
            val = self_values[key]
            diff_text = ""
            if previous:
                diff = val - previous.get(key, 0)
                if diff > 0:
                    diff_text = f" ↑+{diff}"
                elif diff < 0:
                    diff_text = f" ↓{diff}"
            st.caption(f"{label}: {'●' * val}{'○' * (5 - val)}{diff_text}")

    with confirm_cols[2]:
        st.markdown("**重要項目**")
        if priority_action:
            st.caption(f"重点項目: {priority_action}")
        if supervisor_comment:
            st.caption(f"指導者コメント: あり")
        comp_val = self_values.get("self_compliance", 3)
        if comp_val <= 2:
            st.caption(f"⚠️ コンプラ自己評価: {comp_val}")
        if not success_note and not challenge_note:
            st.caption("⚠️ 振り返り記述が未入力です")

    st.markdown("---")

    # === 保存ボタン ===
    col_draft, col_submit = st.columns(2)
    with col_draft:
        save_draft = st.form_submit_button("📋 下書き保存", use_container_width=True)
    with col_submit:
        save_submit = st.form_submit_button("✅ 提出として保存", type="primary", use_container_width=True)

    if save_draft or save_submit:
        data = {
            "employee_id": emp_id,
            "fiscal_year": fiscal_year,
            "quarter": quarter,
            "status": "submitted" if save_submit else "draft",
            **activity_values,
            **self_values,
            **sup_values,
            "success_note": success_note,
            "challenge_note": challenge_note,
            "analysis_note": analysis_note,
            "improvement_plan": improvement_plan,
            "supervisor_comment": supervisor_comment,
            "next_focus": next_focus,
            "priority_action": priority_action,
            "priority_action_result": priority_action_result,
            "coaching_memo": coaching_memo,
        }
        db.save_review(data)
        status_label = "提出" if save_submit else "下書き"
        st.success(f"✅ {fiscal_year}年度{quarter}Qのデータを{status_label}として保存しました。")
