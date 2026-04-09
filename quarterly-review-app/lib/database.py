"""SQLiteデータベース操作モジュール"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

DB_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DB_DIR / "quarterly_review.db"


def get_connection():
    """DB接続を取得"""
    DB_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """テーブル作成"""
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department TEXT DEFAULT '',
            supervisor TEXT DEFAULT '',
            experience_years INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS quarterly_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            fiscal_year INTEGER NOT NULL,
            quarter INTEGER NOT NULL CHECK(quarter BETWEEN 1 AND 4),
            status TEXT DEFAULT 'draft',

            -- 活動実績（数値）
            voice_count INTEGER DEFAULT 0,
            meeting_count INTEGER DEFAULT 0,
            proposal_count INTEGER DEFAULT 0,
            contract_count INTEGER DEFAULT 0,
            confirmation_count INTEGER DEFAULT 0,
            afterfollow_count INTEGER DEFAULT 0,

            -- 自己評価（5段階: 1-5）
            self_customer_understanding INTEGER DEFAULT 3,
            self_hearing INTEGER DEFAULT 3,
            self_needs INTEGER DEFAULT 3,
            self_proposal_clarity INTEGER DEFAULT 3,
            self_compliance INTEGER DEFAULT 3,
            self_follow_up INTEGER DEFAULT 3,
            self_initiative INTEGER DEFAULT 3,
            self_reflection INTEGER DEFAULT 3,

            -- 指導者評価（5段階: 1-5）
            sup_customer_understanding INTEGER DEFAULT 0,
            sup_hearing INTEGER DEFAULT 0,
            sup_needs INTEGER DEFAULT 0,
            sup_proposal_clarity INTEGER DEFAULT 0,
            sup_compliance INTEGER DEFAULT 0,
            sup_follow_up INTEGER DEFAULT 0,
            sup_initiative INTEGER DEFAULT 0,
            sup_reflection INTEGER DEFAULT 0,

            -- 自由記述
            success_note TEXT DEFAULT '',
            challenge_note TEXT DEFAULT '',
            analysis_note TEXT DEFAULT '',
            improvement_plan TEXT DEFAULT '',
            supervisor_comment TEXT DEFAULT '',
            next_focus TEXT DEFAULT '',

            -- 重点実行項目
            priority_action TEXT DEFAULT '',
            priority_action_result TEXT DEFAULT '',

            -- 指導メモ
            coaching_memo TEXT DEFAULT '',

            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),

            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(employee_id, fiscal_year, quarter)
        );
    """)
    conn.commit()
    conn.close()


# === 社員CRUD ===

def get_all_employees():
    """全社員取得"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM employees ORDER BY department, name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_employee(employee_id):
    """社員1件取得"""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM employees WHERE id = ?", (employee_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def add_employee(name, department="", supervisor="", experience_years=0, notes=""):
    """社員追加"""
    conn = get_connection()
    conn.execute(
        """INSERT INTO employees (name, department, supervisor, experience_years, notes)
           VALUES (?, ?, ?, ?, ?)""",
        (name, department, supervisor, experience_years, notes)
    )
    conn.commit()
    conn.close()


def update_employee(employee_id, name, department, supervisor, experience_years, notes):
    """社員更新"""
    conn = get_connection()
    conn.execute(
        """UPDATE employees
           SET name=?, department=?, supervisor=?, experience_years=?, notes=?,
               updated_at=datetime('now','localtime')
           WHERE id=?""",
        (name, department, supervisor, experience_years, notes, employee_id)
    )
    conn.commit()
    conn.close()


def delete_employee(employee_id):
    """社員削除（関連データも削除）"""
    conn = get_connection()
    conn.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
    conn.commit()
    conn.close()


# === 四半期データCRUD ===

def get_review(employee_id, fiscal_year, quarter):
    """特定四半期のデータ取得"""
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM quarterly_reviews
           WHERE employee_id=? AND fiscal_year=? AND quarter=?""",
        (employee_id, fiscal_year, quarter)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_reviews_for_employee(employee_id):
    """社員の全四半期データ取得（時系列順）"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM quarterly_reviews
           WHERE employee_id=?
           ORDER BY fiscal_year, quarter""",
        (employee_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_reviews_by_year(employee_id, fiscal_year):
    """特定年度の四半期データ取得"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM quarterly_reviews
           WHERE employee_id=? AND fiscal_year=?
           ORDER BY quarter""",
        (employee_id, fiscal_year)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_previous_review(employee_id, fiscal_year, quarter):
    """前回の四半期データ取得"""
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM quarterly_reviews
           WHERE employee_id=?
             AND (fiscal_year < ? OR (fiscal_year = ? AND quarter < ?))
           ORDER BY fiscal_year DESC, quarter DESC
           LIMIT 1""",
        (employee_id, fiscal_year, fiscal_year, quarter)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def save_review(data: dict):
    """四半期データ保存（UPSERT）"""
    conn = get_connection()
    existing = conn.execute(
        """SELECT id FROM quarterly_reviews
           WHERE employee_id=? AND fiscal_year=? AND quarter=?""",
        (data["employee_id"], data["fiscal_year"], data["quarter"])
    ).fetchone()

    columns = [
        "employee_id", "fiscal_year", "quarter", "status",
        "voice_count", "meeting_count", "proposal_count",
        "contract_count", "confirmation_count", "afterfollow_count",
        "self_customer_understanding", "self_hearing", "self_needs",
        "self_proposal_clarity", "self_compliance", "self_follow_up",
        "self_initiative", "self_reflection",
        "sup_customer_understanding", "sup_hearing", "sup_needs",
        "sup_proposal_clarity", "sup_compliance", "sup_follow_up",
        "sup_initiative", "sup_reflection",
        "success_note", "challenge_note", "analysis_note",
        "improvement_plan", "supervisor_comment", "next_focus",
        "priority_action", "priority_action_result", "coaching_memo",
    ]

    if existing:
        set_clause = ", ".join(f"{c}=?" for c in columns)
        values = [data.get(c, "") for c in columns]
        values.append(existing["id"])
        conn.execute(
            f"UPDATE quarterly_reviews SET {set_clause}, updated_at=datetime('now','localtime') WHERE id=?",
            values
        )
    else:
        placeholders = ", ".join("?" for _ in columns)
        col_names = ", ".join(columns)
        values = [data.get(c, "") for c in columns]
        conn.execute(
            f"INSERT INTO quarterly_reviews ({col_names}) VALUES ({placeholders})",
            values
        )

    conn.commit()
    conn.close()


def get_all_reviews():
    """全四半期データ取得"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT qr.*, e.name as employee_name, e.department
           FROM quarterly_reviews qr
           JOIN employees e ON qr.employee_id = e.id
           ORDER BY qr.fiscal_year DESC, qr.quarter DESC, e.name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_reviews():
    """各社員の最新四半期データ取得"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT qr.*, e.name as employee_name, e.department, e.supervisor
           FROM quarterly_reviews qr
           JOIN employees e ON qr.employee_id = e.id
           WHERE (qr.fiscal_year, qr.quarter) = (
               SELECT fiscal_year, quarter FROM quarterly_reviews
               WHERE employee_id = qr.employee_id
               ORDER BY fiscal_year DESC, quarter DESC LIMIT 1
           )
           ORDER BY e.department, e.name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_submission_status(fiscal_year, quarter):
    """提出状況を取得（全社員に対して）"""
    conn = get_connection()
    employees = conn.execute("SELECT id, name, department FROM employees ORDER BY department, name").fetchall()
    reviews = conn.execute(
        """SELECT employee_id, status FROM quarterly_reviews
           WHERE fiscal_year=? AND quarter=?""",
        (fiscal_year, quarter)
    ).fetchall()
    conn.close()

    review_map = {r["employee_id"]: r["status"] for r in reviews}
    result = []
    for e in employees:
        result.append({
            "employee_id": e["id"],
            "name": e["name"],
            "department": e["department"],
            "status": review_map.get(e["id"], "未提出"),
        })
    return result


def delete_review(review_id):
    """四半期データ削除"""
    conn = get_connection()
    conn.execute("DELETE FROM quarterly_reviews WHERE id = ?", (review_id,))
    conn.commit()
    conn.close()


# === サンプルデータ ===

def seed_sample_data():
    """サンプルデータ投入"""
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) as cnt FROM employees").fetchone()["cnt"]
    if count > 0:
        conn.close()
        return

    # 社員データ
    employees = [
        ("田中 太郎", "営業第一課", "山田 指導員", 3, "主力メンバー。コミュニケーション力高い"),
        ("佐藤 花子", "営業第一課", "山田 指導員", 1, "新人。意欲的だが経験不足"),
        ("鈴木 一郎", "営業第二課", "山田 指導員", 5, "ベテラン。安定した成果"),
        ("高橋 美咲", "営業第二課", "山田 指導員", 2, "成長途上。フォロー力に課題"),
    ]
    for name, dept, sup, exp, notes in employees:
        conn.execute(
            "INSERT INTO employees (name, department, supervisor, experience_years, notes) VALUES (?,?,?,?,?)",
            (name, dept, sup, exp, notes)
        )

    # 四半期データ（2024年度・2025年度）
    sample_reviews = [
        # 田中太郎 - 2024年度
        (1, 2024, 1, "submitted", 45, 20, 12, 5, 8, 10, 4, 3, 3, 4, 4, 3, 4, 3, 4, 4, 3, 4, 4, 3, 4, 3,
         "新規顧客への声かけが増えた", "クロージングが弱い", "商品知識の不足", "商品研修を受講する",
         "声かけ量は十分。提案の質を上げていきましょう", "提案ロールプレイの実施", "提案トーク改善", ""),
        (1, 2024, 2, "submitted", 50, 25, 15, 7, 10, 12, 4, 4, 3, 4, 4, 3, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4,
         "提案力が向上した", "アフターフォローが後手になる", "時間管理", "フォロー予定を週次で管理",
         "着実に改善が見られます。継続してください", "フォロー管理の仕組み化", "フォロー件数を増やす", "実施済み"),
        (1, 2024, 3, "submitted", 55, 28, 18, 9, 12, 15, 4, 4, 4, 4, 5, 4, 4, 4, 5, 4, 4, 5, 5, 4, 5, 4,
         "成約率が上がった", "忙しさで振り返りが疎かに", "業務優先度の判断", "週末に振り返り時間を確保",
         "成果が出ています。振り返り習慣の定着を", "振り返りシートの活用", "振り返り習慣の定着", "概ね達成"),
        (1, 2025, 1, "submitted", 60, 30, 20, 10, 15, 18, 5, 4, 4, 5, 5, 4, 5, 4, 5, 5, 4, 5, 5, 4, 5, 5,
         "年間目標を上回るペース", "後輩指導との両立", "役割の整理", "指導時間をスケジュール化",
         "素晴らしい成長です。後輩育成にも期待します", "後輩指導の進捗確認", "後輩指導と営業の両立", ""),
        # 佐藤花子 - 2024年度
        (2, 2024, 2, "submitted", 20, 8, 3, 1, 3, 2, 2, 2, 2, 2, 3, 2, 3, 2, 2, 2, 2, 2, 4, 2, 3, 3,
         "声かけに慣れてきた", "面談がうまく進められない", "トークスキル不足", "先輩の面談に同席する",
         "まずは面談の型を身につけましょう", "面談同席とフィードバック", "面談ロールプレイ", ""),
        (2, 2024, 3, "submitted", 25, 12, 5, 2, 5, 4, 3, 3, 2, 3, 3, 2, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3,
         "面談件数が増えた", "ニーズ把握が浅い", "質問の幅が狭い", "ヒアリングシートを活用する",
         "面談数増加は良い兆候。質の向上を", "ヒアリング練習", "ニーズ把握力向上", "実施中"),
        (2, 2025, 1, "submitted", 30, 15, 8, 3, 7, 6, 3, 3, 3, 3, 4, 3, 4, 3, 3, 3, 3, 3, 4, 3, 4, 3,
         "提案までつなげられるようになった", "成約率がまだ低い", "クロージングの自信不足", "成功事例を研究する",
         "着実に成長しています。成約までのプロセスを強化しましょう", "クロージング練習", "成約率向上", "一部達成"),
        # 鈴木一郎 - 2024年度
        (3, 2024, 1, "submitted", 40, 30, 20, 12, 15, 20, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 3, 3,
         "安定した成果", "新しい取り組みが少ない", "マンネリ化", "新商品の提案を増やす",
         "安定感は評価できます。新しいチャレンジも期待", "新商品勉強会参加", "新商品提案", ""),
        (3, 2025, 1, "submitted", 38, 28, 18, 10, 14, 18, 4, 4, 4, 4, 5, 4, 3, 3, 4, 4, 4, 4, 5, 4, 3, 3,
         "コンプライアンス意識が向上", "モチベーション維持が課題", "目標の見直し不足", "半期目標を再設定",
         "コンプラ意識の向上は良い変化。主体性をもう少し", "目標設定面談", "主体的な行動計画", "未達"),
        # 高橋美咲 - 2024年度
        (4, 2024, 3, "submitted", 30, 18, 10, 4, 6, 5, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3,
         "提案件数が増えた", "フォローが手薄", "顧客管理の仕組みがない", "顧客リストを整備する",
         "提案力は伸びています。フォロー体制の構築を", "顧客管理リスト作成", "継続フォロー体制構築", ""),
        (4, 2025, 1, "draft", 35, 20, 12, 5, 8, 8, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3,
         "フォロー件数が改善", "まだ契約確認が少ない", "確認のタイミングがわからない", "確認時期のルール化",
         "", "", "契約確認のタイミング習得", "一部達成"),
    ]

    for row in sample_reviews:
        conn.execute(
            """INSERT INTO quarterly_reviews (
                employee_id, fiscal_year, quarter, status,
                voice_count, meeting_count, proposal_count,
                contract_count, confirmation_count, afterfollow_count,
                self_customer_understanding, self_hearing, self_needs,
                self_proposal_clarity, self_compliance, self_follow_up,
                self_initiative, self_reflection,
                sup_customer_understanding, sup_hearing, sup_needs,
                sup_proposal_clarity, sup_compliance, sup_follow_up,
                sup_initiative, sup_reflection,
                success_note, challenge_note, analysis_note, improvement_plan,
                supervisor_comment, next_focus, priority_action, priority_action_result
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            row
        )

    conn.commit()
    conn.close()


# 起動時にDB初期化
init_db()
