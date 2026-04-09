"""社員管理ページ - 登録・編集・削除"""

import streamlit as st
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib import database as db

st.set_page_config(page_title="社員管理", page_icon="👥", layout="wide")

st.title("👥 社員管理")
st.caption("指導対象社員の登録・編集・削除")

st.markdown(
    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:0.6rem 1rem;font-size:0.85rem;margin-bottom:1rem;">'
    '⚠️ 顧客情報（氏名・証券番号・契約番号等）は入力しないでください。</div>',
    unsafe_allow_html=True
)

# タブで「一覧」「新規登録」「編集」を切り替え
tab_list, tab_add, tab_edit = st.tabs(["📋 社員一覧", "➕ 新規登録", "✏️ 編集・削除"])

# === 社員一覧 ===
with tab_list:
    employees = db.get_all_employees()
    if not employees:
        st.info("社員が登録されていません。「新規登録」タブから追加してください。")
    else:
        import pandas as pd
        df = pd.DataFrame([{
            "ID": e["id"],
            "社員名": e["name"],
            "所属": e["department"],
            "指導担当者": e["supervisor"],
            "経験年数": e["experience_years"],
            "備考": e["notes"],
        } for e in employees])
        st.dataframe(df, use_container_width=True, hide_index=True)
        st.caption(f"登録社員数: {len(employees)}名")

# === 新規登録 ===
with tab_add:
    st.subheader("新規社員登録")
    with st.form("add_employee", clear_on_submit=True):
        name = st.text_input("社員名 *", placeholder="例: 山田 太郎")
        col1, col2 = st.columns(2)
        with col1:
            department = st.text_input("所属", placeholder="例: 営業第一課")
        with col2:
            supervisor = st.text_input("指導担当者名", placeholder="例: 佐藤 指導員")
        experience_years = st.number_input("経験年数", min_value=0, max_value=50, value=1, step=1)
        notes = st.text_area("備考", placeholder="特記事項があれば記入", height=80)

        submitted = st.form_submit_button("登録する", type="primary", use_container_width=True)
        if submitted:
            if not name.strip():
                st.error("社員名は必須です。")
            else:
                db.add_employee(name.strip(), department.strip(), supervisor.strip(), experience_years, notes.strip())
                st.success(f"「{name.strip()}」を登録しました。")
                st.rerun()

# === 編集・削除 ===
with tab_edit:
    employees = db.get_all_employees()
    if not employees:
        st.info("編集する社員がいません。")
    else:
        emp_options = {f"{e['name']}（{e['department']}）": e for e in employees}
        selected_label = st.selectbox("編集する社員を選択", list(emp_options.keys()))
        emp = emp_options[selected_label]

        st.subheader(f"「{emp['name']}」の編集")

        with st.form("edit_employee"):
            name = st.text_input("社員名", value=emp["name"])
            col1, col2 = st.columns(2)
            with col1:
                department = st.text_input("所属", value=emp["department"])
            with col2:
                supervisor = st.text_input("指導担当者名", value=emp["supervisor"])
            experience_years = st.number_input(
                "経験年数", min_value=0, max_value=50,
                value=emp["experience_years"], step=1
            )
            notes = st.text_area("備考", value=emp["notes"], height=80)

            col_save, col_del = st.columns(2)
            with col_save:
                save_btn = st.form_submit_button("更新する", type="primary", use_container_width=True)
            with col_del:
                del_btn = st.form_submit_button("🗑️ 削除する", use_container_width=True)

            if save_btn:
                if not name.strip():
                    st.error("社員名は必須です。")
                else:
                    db.update_employee(emp["id"], name.strip(), department.strip(), supervisor.strip(), experience_years, notes.strip())
                    st.success("更新しました。")
                    st.rerun()

            if del_btn:
                st.session_state["confirm_delete"] = emp["id"]

        if st.session_state.get("confirm_delete") == emp["id"]:
            st.warning(f"「{emp['name']}」を削除すると、関連する四半期データもすべて削除されます。")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("はい、削除します", type="primary", use_container_width=True):
                    db.delete_employee(emp["id"])
                    st.session_state.pop("confirm_delete", None)
                    st.success("削除しました。")
                    st.rerun()
            with col2:
                if st.button("キャンセル", use_container_width=True):
                    st.session_state.pop("confirm_delete", None)
                    st.rerun()
