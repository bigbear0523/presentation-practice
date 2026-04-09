"""CSVエクスポートモジュール（改善版）

改善点:
- 実務で使う列順に整理（基本情報→活動→評価→記述）
- 指導メモは別CSVオプション
- 状態を日本語表記
- 指導者評価0は空欄出力
"""

import pandas as pd
from lib.charts import EVAL_LABELS, EVAL_KEYS_SELF, EVAL_KEYS_SUP, ACTIVITY_LABELS, ACTIVITY_KEYS
from lib import database as db


def reviews_to_dataframe(reviews, employees=None, include_memo=False):
    """四半期データをDataFrameに変換

    Args:
        include_memo: True の場合、指導メモ列を含める
    """
    if not reviews:
        return pd.DataFrame()

    emp_map = {}
    if employees:
        emp_map = {e["id"]: e for e in employees}

    rows = []
    for r in reviews:
        emp = emp_map.get(r.get("employee_id"), {})
        status_map = {"submitted": "提出済", "draft": "下書き"}
        row = {
            "社員名": r.get("employee_name", emp.get("name", "")),
            "所属": r.get("department", emp.get("department", "")),
            "年度": r.get("fiscal_year", ""),
            "四半期": f"{r.get('quarter', '')}Q",
            "状態": status_map.get(r.get("status", ""), r.get("status", "")),
        }

        # 活動実績
        for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
            row[f"活動_{label}"] = r.get(key, 0)
        row["活動_合計"] = sum(r.get(k, 0) for k in ACTIVITY_KEYS)

        # 自己評価
        self_total = 0
        for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
            val = r.get(key, 0)
            row[f"自己評価_{label}"] = val
            self_total += val
        row["自己評価_平均"] = round(self_total / len(EVAL_KEYS_SELF), 1)

        # 指導者評価（0は空欄）
        sup_total = 0
        sup_count = 0
        for key, label in zip(EVAL_KEYS_SUP, EVAL_LABELS):
            val = r.get(key, 0)
            row[f"指導者評価_{label}"] = val if val > 0 else ""
            if val > 0:
                sup_total += val
                sup_count += 1
        row["指導者評価_平均"] = round(sup_total / sup_count, 1) if sup_count > 0 else ""

        # 記述
        row["うまくいったこと"] = r.get("success_note", "")
        row["苦戦したこと"] = r.get("challenge_note", "")
        row["自己分析"] = r.get("analysis_note", "")
        row["改善行動"] = r.get("improvement_plan", "")
        row["指導者コメント"] = r.get("supervisor_comment", "")
        row["次回重点確認"] = r.get("next_focus", "")
        row["重点実行項目"] = r.get("priority_action", "")
        row["重点項目_達成状況"] = r.get("priority_action_result", "")

        if include_memo:
            row["指導メモ"] = r.get("coaching_memo", "")

        rows.append(row)

    return pd.DataFrame(rows)


def reviews_to_simple_dataframe(reviews, employees=None):
    """実務用の簡易DataFrame（活動+評価平均のみ）"""
    if not reviews:
        return pd.DataFrame()

    emp_map = {}
    if employees:
        emp_map = {e["id"]: e for e in employees}

    rows = []
    for r in reviews:
        emp = emp_map.get(r.get("employee_id"), {})
        status_map = {"submitted": "提出済", "draft": "下書き"}
        total_act = sum(r.get(k, 0) for k in ACTIVITY_KEYS)
        avg_self = sum(r.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)

        row = {
            "社員名": r.get("employee_name", emp.get("name", "")),
            "所属": r.get("department", emp.get("department", "")),
            "年度": r.get("fiscal_year", ""),
            "四半期": f"{r.get('quarter', '')}Q",
            "状態": status_map.get(r.get("status", ""), ""),
            "活動合計": total_act,
            "自己評価平均": round(avg_self, 1),
            "成約件数": r.get("contract_count", 0),
            "コンプラ自己": r.get("self_compliance", 0),
            "重点実行項目": r.get("priority_action", ""),
            "達成状況": r.get("priority_action_result", ""),
            "指導者コメント": r.get("supervisor_comment", ""),
        }
        rows.append(row)

    return pd.DataFrame(rows)


def employees_to_dataframe(employees):
    """社員データをDataFrameに変換"""
    if not employees:
        return pd.DataFrame()

    rows = []
    for e in employees:
        rows.append({
            "社員名": e.get("name", ""),
            "所属": e.get("department", ""),
            "指導担当者": e.get("supervisor", ""),
            "経験年数": e.get("experience_years", 0),
            "備考": e.get("notes", ""),
        })
    return pd.DataFrame(rows)


def export_all_data():
    """全データのDataFrameを返す"""
    employees = db.get_all_employees()
    reviews = db.get_all_reviews()
    return reviews_to_dataframe(reviews, employees)
