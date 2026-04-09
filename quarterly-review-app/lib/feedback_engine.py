"""ルールベース自動フィードバックエンジン（改善版）

改善点:
- generate_summary(): 1行総評を生成
- get_coaching_points(): 指導ポイント上位3を抽���
- get_persistent_issues(): 継続課題を検出
- 文言を自然な日本語に改善（断定しすぎず、曖昧すぎない）
- 良い点・注意点・次回重点の重複排除
- コンプライアンス最優先を維持
"""

from lib.charts import EVAL_KEYS_SELF, EVAL_KEYS_SUP, EVAL_LABELS, ACTIVITY_KEYS, ACTIVITY_LABELS


def generate_summary(review, previous=None):
    """今回の総評を1〜2文で生成する"""
    self_scores = {k: review.get(k, 0) for k in EVAL_KEYS_SELF}
    activities = {k: review.get(k, 0) for k in ACTIVITY_KEYS}
    total_activity = sum(activities.values())
    avg_self = sum(self_scores.values()) / len(self_scores)

    # コンプライアンスが低い場合は最優先で触れる
    if self_scores.get("self_compliance", 0) <= 2:
        return "コンプライアンス意識に課題が見られます。成果面の前に、まず募集品質・説明品質の立て直しを最優先で進める必要があります。"

    parts = []

    # 前回比較があれば傾向を入れる
    if previous:
        prev_avg = sum(previous.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)
        prev_total = sum(previous.get(k, 0) for k in ACTIVITY_KEYS)
        eval_diff = avg_self - prev_avg
        act_diff = total_activity - prev_total

        if eval_diff > 0.3 and act_diff >= 0:
            parts.append("前回からの改善傾向が見られ、取り組みの成果が表れています。")
        elif eval_diff < -0.3:
            parts.append("前回と比べて自己評価にやや低下が見られます。要因の確認が���要です。")
        elif act_diff >= 15:
            parts.append("活動量が増加しており、行動面での積極性が伺えます。")

    # 全体傾向
    if avg_self >= 4.0 and total_activity >= 80:
        parts.append("活動量・自己評価ともに高水準で、安定した成果を出せている状態です。")
    elif avg_self >= 3.5 and total_activity >= 50:
        parts.append("一定の活動量と評価が確保されており、次のステップへの土台ができています。")
    elif total_activity >= 60 and avg_self < 3.0:
        parts.append("量は確保できていますが、質の面での改善が次の成長ポイントになり���うです。")
    elif total_activity < 40:
        parts.append("活動量がやや少なめです。まずは行動量の確保から取り組むことが効果的です。")
    else:
        parts.append("着実に活動に取り組んでいる様子が伺えます。")

    return "".join(parts) if parts else "入力データに基づき、個別の状況を確認してフィードバックを行って��ださい。"


def generate_feedback(review, previous=None):
    """
    入力データからフィードバック補助コメントを生成
    Returns: {"good": [...], "caution": [...], "next_focus": [...]}

    改善点:
    - 3カテゴリ間の重複を排除
    - 自然な日本語表現
    - 育成支援トーンを維持
    """
    good = []
    caution = []
    next_focus = []
    _used_topics = set()  # 重複防止用

    # === 評価値の取得 ===
    self_scores = {k: review.get(k, 0) for k in EVAL_KEYS_SELF}
    sup_scores = {k: review.get(k, 0) for k in EVAL_KEYS_SUP}
    has_sup = any(v > 0 for v in sup_scores.values())

    activities = {k: review.get(k, 0) for k in ACTIVITY_KEYS}
    total_activity = sum(activities.values())

    avg_self = sum(self_scores.values()) / len(self_scores) if self_scores else 0

    # 高い項目と低い項目
    scored_items = [(EVAL_LABELS[i], v) for i, (k, v) in enumerate(self_scores.items())]
    sorted_items = sorted(scored_items, key=lambda x: x[1], reverse=True)
    top3 = sorted_items[:3]
    bottom3 = sorted_items[-3:]

    # === コンプライアンス（最優先チェック） ===
    compliance_self = self_scores.get("self_compliance", 0)
    compliance_sup = sup_scores.get("sup_compliance", 0) if has_sup else 0
    if compliance_self <= 2 or (has_sup and compliance_sup <= 2):
        caution.insert(0, "コンプライアンス意識の評価が低く、最優先で対応が必要です。"
                       "成果よりもまず、募集品質・説明品質を見直す取り組みから始めることをお勧めします。")
        next_focus.insert(0, "【最優先】コンプライアンス意識の向上 — 説明品質の確認と改善")
        _used_topics.add("compliance")

    # === 活動量に関するフィ��ドバック ===
    if total_activity >= 80:
        good.append("活動量が十分に確保されています。この行動力を基盤に、質の面でもさらに伸ばしていけそうです。")
    elif total_activity >= 50:
        good.append("一定の活動量が確保されており、取り組み姿勢が伺えます。")
    else:
        if "activity" not in _used_topics:
            caution.append("活動量がやや少なめの傾向です。声かけや面談の件数確保から、少しずつ増やしていけるとよさそうです。")
            next_focus.append("活動量の底上げ — まずは声かけ・面談の件数を意識する")
            _used_topics.add("activity")

    # === 成約率 ===
    if activities.get("proposal_count", 0) > 0:
        close_rate = activities.get("contract_count", 0) / activities["proposal_count"]
        if close_rate >= 0.5:
            good.append(f"提案に対する成約率が高い水準です（{close_rate:.0%}）。提案の質の高さが伺えます。")
        elif close_rate < 0.2 and activities["proposal_count"] >= 5:
            if "proposal_quality" not in _used_topics:
                caution.append("提案件数に対して成約に至る割合がやや低めです。提案の内容やタイミングを一緒に振り返ってみると改善のヒントが見つかるかもしれません。")
                _used_topics.add("proposal_quality")

    # === 活動量と評価のバランス ===
    hearing_score = self_scores.get("self_hearing", 0)
    needs_score = self_scores.get("self_needs", 0)
    if total_activity >= 60 and (hearing_score <= 2 or needs_score <= 2):
        if "quality" not in _used_topics:
            caution.append("活動量は確保できている一方で、ヒアリングやニーズ把握の面に課題感があるようです。"
                          "面談の質を高めることが、次の成長につながり��うです。")
            next_focus.append("面談の質向上 — ヒアリング力・ニーズ把握力の強化")
            _used_topics.add("quality")

    # === 成約とフォローのバランス ===
    follow_score = self_scores.get("self_follow_up", 0)
    if activities.get("contract_count", 0) >= 3 and follow_score <= 2:
        if "follow_up" not in _used_topics:
            caution.append("成約実績がある一方で、継続フォローの評価がやや低めです。"
                          "関係維持や再提案の機会を広げるために、フォロー体制を整えていきましょう。")
            next_focus.append("継続フォロー体制の構築 — 契約後のフォロー計画を立てる")
            _used_topics.add("follow_up")

    if activities.get("afterfollow_count", 0) >= 10:
        good.append("アフターフォローへの意識が高く、顧客との関係構築に丁寧に取り組んでいます。")

    # === 自己評価の強み・弱み ===
    high_items = [name for name, score in top3 if score >= 4]
    low_items = [name for name, score in bottom3 if score <= 2]

    if high_items:
        good.append(f"「{'」「'.join(high_items)}」が強みとして発揮されています。これらを軸にした活動が効果的です。")
    if low_items and "weakness" not in _used_topics:
        caution.append(f"「{'」「'.join(low_items)}」に課題感が見られます。一度に全てではなく、優先順位をつけて段階的に改善していきましょう。")
        _used_topics.add("weakness")

    # === 指導者評価とのギャップ ===
    if has_sup:
        over_items = []
        under_items = []
        for i, (sk, pk) in enumerate(zip(EVAL_KEYS_SELF, EVAL_KEYS_SUP)):
            diff = self_scores[sk] - sup_scores[pk]
            if diff >= 2:
                over_items.append(EVAL_LABELS[i])
            elif diff <= -2:
                under_items.append(EVAL_LABELS[i])

        if over_items:
            caution.append(f"「{'」「'.join(over_items)}」で自己評価と指導者評価に差があります。"
                          "認識のすり合わせを面談で行うと、より的確な自己理解につながります。")
        if under_items:
            good.append(f"「{'」「'.join(under_items)}」は指導者から見て実力以上に謙虚な評価です。自信を持って取り組んでください。")

    # === 前回比較 ===
    if previous:
        improved = []
        declined = []
        for i, k in enumerate(EVAL_KEYS_SELF):
            diff = review.get(k, 0) - previous.get(k, 0)
            if diff >= 1:
                improved.append(EVAL_LABELS[i])
            elif diff <= -1:
                declined.append(EVAL_LABELS[i])

        prev_total = sum(previous.get(k, 0) for k in ACTIVITY_KEYS)
        activity_diff = total_activity - prev_total

        if len(improved) >= 3:
            good.append(f"前回から複数の項目（{'、'.join(improved)}）で改善が見られます。"
                       "取り組みの成果が自己評価にも表れており、この調子で継続してい��ましょう。")
        elif improved:
            good.append(f"前回から「{'」「'.join(improved)}」に改善が見られます。努力が反映されています。")

        if declined:
            if "declined" not in _used_topics:
                caution.append(f"前回から「{'」「'.join(declined)}」がやや下降しています。"
                              "一時的な要因かもしれませんが、次回に向けて一緒に確認してみましょう。")
                next_focus.append(f"低下項目のフォロー — {'、'.join(declined)}の要因確認")
                _used_topics.add("declined")

        if activity_diff >= 20:
            good.append(f"活動量が前回から大きく増加しています（+{activity_diff}件）。行動面での積極性が伺えます。")
        elif activity_diff <= -20:
            if "activity_decline" not in _used_topics:
                caution.append(f"活動量が前回から減少しています（{activity_diff}件）。環境要因も含めて確認してみましょう。")
                _used_topics.add("activity_decline")

        # 重点実行項目の達成確認
        prev_action = previous.get("priority_action", "")
        cur_result = review.get("priority_action_result", "")
        if prev_action:
            if cur_result and "達成" in cur_result:
                good.append(f"前回設定した重点項目「{prev_action}」の達成が確認できました。設定→実行→確認のサイクルが回っています。")
            elif cur_result and "未達" in cur_result:
                caution.append(f"前回の重点項目「{prev_action}」が未達となっています。"
                              "阻害要因を確認し、取り組みやすい形に再設定しましょう。")
                next_focus.append(f"前回未達項目の再設定 —「{prev_action}」のハードルを見直す")

    # === 主体性・改善力 ===
    initiative = self_scores.get("self_initiative", 0)
    reflection = self_scores.get("self_reflection", 0)
    if initiative >= 4 and reflection >= 4:
        good.append("主体性と振り返り力が高く、自ら成長サイクルを回せる状態です。")
    elif initiative <= 2 and "initiative" not in _used_topics:
        next_focus.append("自ら課題を見つけて行動する習慣づくり")
        _used_topics.add("initiative")

    # === デフォルトメッセージ ===
    if not good:
        good.append("現時点の状況を踏まえ、面談で個別にフィードバックを行ってください。")
    if not next_focus:
        next_focus.append("次回面談で、具体的な改善行動を一緒に設定しましょう。")

    return {"good": good, "caution": caution, "next_focus": next_focus}


def get_coaching_points(review, previous=None):
    """指導ポイント上位3つを自動抽出する

    Returns: [{"point": str, "reason": str, "priority": "high"|"medium"}, ...]
    """
    points = []

    self_scores = {k: review.get(k, 0) for k in EVAL_KEYS_SELF}
    sup_scores = {k: review.get(k, 0) for k in EVAL_KEYS_SUP}
    has_sup = any(v > 0 for v in sup_scores.values())
    activities = {k: review.get(k, 0) for k in ACTIVITY_KEYS}

    # 1. コンプライアンス（最優先）
    if self_scores.get("self_compliance", 0) <= 2 or (has_sup and sup_scores.get("sup_compliance", 0) <= 2):
        points.append({
            "point": "コンプライアンス意識の立て直し",
            "reason": "募集品質・説明品質の確認が最優先事項です",
            "priority": "high",
        })

    # 2. 指導者評価とのギャップ大
    if has_sup:
        for i, (sk, pk) in enumerate(zip(EVAL_KEYS_SELF, EVAL_KEYS_SUP)):
            diff = self_scores[sk] - sup_scores[pk]
            if diff >= 2:
                points.append({
                    "point": f"「{EVAL_LABELS[i]}」の認識すり合わせ",
                    "reason": f"自己評価{self_scores[sk]}に対し指導者評価{sup_scores[pk]}で差がある",
                    "priority": "high",
                })

    # 3. 前回から低下した項目
    if previous:
        for i, k in enumerate(EVAL_KEYS_SELF):
            diff = review.get(k, 0) - previous.get(k, 0)
            if diff <= -1:
                points.append({
                    "point": f"「{EVAL_LABELS[i]}」の低下要因の確認",
                    "reason": f"前回から{diff:+d}の変化",
                    "priority": "medium",
                })

    # 4. 自己評価2以下の項目
    for i, k in enumerate(EVAL_KEYS_SELF):
        label = EVAL_LABELS[i]
        if self_scores[k] <= 2 and not any(p["point"].startswith(f"「{label}」") for p in points):
            points.append({
                "point": f"「{label}」の改善支援",
                "reason": f"自己評価が{self_scores[k]}と低め",
                "priority": "medium",
            })

    # 5. 前回未達の重点項目
    if previous and previous.get("priority_action"):
        result = review.get("priority_action_result", "")
        if "未達" in result:
            points.append({
                "point": f"前回重点項目の再設定",
                "reason": f"「{previous['priority_action']}」が未達",
                "priority": "medium",
            })

    # 6. 活動量が少ない
    total = sum(activities.values())
    if total < 40:
        points.append({
            "point": "活動量の底上げ",
            "reason": f"活動合計{total}件とやや少なめ",
            "priority": "medium",
        })

    # 優先度でソートし上位3つ
    priority_order = {"high": 0, "medium": 1}
    points.sort(key=lambda x: priority_order.get(x["priority"], 2))
    return points[:3]


def get_persistent_issues(reviews):
    """複数四半期にわたって継続している課題を検出する

    Args:
        reviews: 時系列順の四半期データリスト（2件以上必要）

    Returns: [{"label": str, "quarters": int, "detail": str}, ...]
    """
    if len(reviews) < 2:
        return []

    issues = []
    for i, k in enumerate(EVAL_KEYS_SELF):
        label = EVAL_LABELS[i]
        consecutive_low = 0
        for r in reviews:
            if r.get(k, 0) <= 2:
                consecutive_low += 1
            else:
                consecutive_low = 0

        if consecutive_low >= 2:
            issues.append({
                "label": label,
                "quarters": consecutive_low,
                "detail": f"{consecutive_low}四半期連続で評価2以下",
            })

    return issues


def get_stable_strengths(reviews):
    """複数四半期にわたって安定している強みを検出する

    Args:
        reviews: 時系列順の四半期データリスト（2件以上必要）

    Returns: [{"label": str, "quarters": int}, ...]
    """
    if len(reviews) < 2:
        return []

    strengths = []
    for i, k in enumerate(EVAL_KEYS_SELF):
        label = EVAL_LABELS[i]
        consecutive_high = 0
        for r in reviews:
            if r.get(k, 0) >= 4:
                consecutive_high += 1
            else:
                consecutive_high = 0

        if consecutive_high >= 2:
            strengths.append({
                "label": label,
                "quarters": consecutive_high,
            })

    return strengths


def get_next_meeting_points(review, previous=None, all_reviews=None):
    """次回面談で確認すべきポイントを自動生成する

    Returns: [str, ...]
    """
    points = []

    # 前回の重点実行項目があれば確認対象
    if review.get("priority_action"):
        points.append(f"重点実行項目「{review['priority_action']}」の進捗確認")

    # コンプライアンス低評価
    if review.get("self_compliance", 0) <= 2:
        points.append("コンプライアンス意識の改善状況 — 具体的な取り組みを確認")

    # 指導者コメントで設定した次回確認事項
    if review.get("next_focus"):
        points.append(f"前回設定の確認事項: {review['next_focus']}")

    # 継続課題
    if all_reviews and len(all_reviews) >= 2:
        persistent = get_persistent_issues(all_reviews)
        for issue in persistent[:2]:
            points.append(f"継続課題「{issue['label']}」の改善アクション確認（{issue['detail']}）")

    # 前回から低下した項目
    if previous:
        for i, k in enumerate(EVAL_KEYS_SELF):
            diff = review.get(k, 0) - previous.get(k, 0)
            if diff <= -1:
                points.append(f"「{EVAL_LABELS[i]}」が前回から低下 — 要因と対策の確認")

    # 改善行動の記入がある場合
    if review.get("improvement_plan"):
        points.append(f"改善行動「{review['improvement_plan'][:30]}...」の実行状況")

    return points[:5]  # 最大5つ


def get_strengths(review, top_n=3):
    """強み上位N項目を返す"""
    items = [(EVAL_LABELS[i], review.get(k, 0)) for i, k in enumerate(EVAL_KEYS_SELF)]
    return sorted(items, key=lambda x: x[1], reverse=True)[:top_n]


def get_weaknesses(review, top_n=3):
    """��み上位N項目��返す"""
    items = [(EVAL_LABELS[i], review.get(k, 0)) for i, k in enumerate(EVAL_KEYS_SELF)]
    return sorted(items, key=lambda x: x[1])[:top_n]


def get_priority_items(review):
    """指導優先度の高い項目を返す"""
    priorities = []

    # コンプライアンスが低い場合は最優先
    if review.get("self_compliance", 0) <= 2:
        priorities.append(("コンプライアンス意識", "最優先", "danger"))
    if review.get("sup_compliance", 0) > 0 and review.get("sup_compliance", 0) <= 2:
        priorities.append(("コン��ライアンス意識（指導者評価）", "最優先", "danger"))

    # 指導者評価が自己評価より低い項目
    for i, (sk, pk) in enumerate(zip(EVAL_KEYS_SELF, EVAL_KEYS_SUP)):
        s_val = review.get(sk, 0)
        p_val = review.get(pk, 0)
        if p_val > 0 and s_val - p_val >= 2:
            priorities.append((EVAL_LABELS[i], "認識差あり", "warning"))

    # 自己評価が2以下の項目
    for i, k in enumerate(EVAL_KEYS_SELF):
        val = review.get(k, 0)
        label = EVAL_LABELS[i]
        if val <= 2 and not any(p[0] == label for p in priorities):
            priorities.append((label, "要改善", "warning"))

    return priorities


def get_gap_items(review):
    """自己評価と指導者評価のギャップが大きい項目"""
    gaps = []
    for i, (sk, pk) in enumerate(zip(EVAL_KEYS_SELF, EVAL_KEYS_SUP)):
        s_val = review.get(sk, 0)
        p_val = review.get(pk, 0)
        if p_val > 0:
            diff = s_val - p_val
            if abs(diff) >= 2:
                gaps.append({
                    "label": EVAL_LABELS[i],
                    "self": s_val,
                    "sup": p_val,
                    "diff": diff,
                    "note": "自己評価が高い" if diff > 0 else "指導者評価が高い",
                })
    return gaps
