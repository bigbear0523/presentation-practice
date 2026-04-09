"""Plotlyグラフ生成モジュール"""

import plotly.graph_objects as go
import plotly.express as px
import pandas as pd

# 評価項目ラベル
EVAL_LABELS = [
    "お客さま理解", "ヒアリング力", "ニーズ把握力",
    "提案のわかりやすさ", "コンプライアンス意識", "継続フォロー",
    "主体性", "振り返り・改善力"
]

EVAL_KEYS_SELF = [
    "self_customer_understanding", "self_hearing", "self_needs",
    "self_proposal_clarity", "self_compliance", "self_follow_up",
    "self_initiative", "self_reflection"
]

EVAL_KEYS_SUP = [
    "sup_customer_understanding", "sup_hearing", "sup_needs",
    "sup_proposal_clarity", "sup_compliance", "sup_follow_up",
    "sup_initiative", "sup_reflection"
]

ACTIVITY_LABELS = [
    "声かけ", "面談", "提案", "成約", "契約確認", "アフターフォロー"
]

ACTIVITY_KEYS = [
    "voice_count", "meeting_count", "proposal_count",
    "contract_count", "confirmation_count", "afterfollow_count"
]

# 統一カラーパレット
COLORS = {
    "primary": "#1f77b4",
    "secondary": "#ff7f0e",
    "success": "#2ca02c",
    "danger": "#d62728",
    "info": "#17becf",
    "self": "#1f77b4",
    "sup": "#ff7f0e",
    "gap": "#d62728",
}


def _base_layout(title="", height=400):
    """共通レイアウト設定"""
    return dict(
        title=dict(text=title, font=dict(size=16)),
        height=height,
        margin=dict(l=40, r=40, t=50, b=40),
        font=dict(family="sans-serif", size=12),
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
    )


def radar_chart(review, title="自己評価レーダーチャート", show_sup=True):
    """レーダーチャート（自己評価 + 指導者評価）"""
    self_values = [review.get(k, 0) for k in EVAL_KEYS_SELF]
    self_values.append(self_values[0])  # 閉じる
    labels = EVAL_LABELS + [EVAL_LABELS[0]]

    fig = go.Figure()

    fig.add_trace(go.Scatterpolar(
        r=self_values,
        theta=labels,
        fill="toself",
        name="自己評価",
        line_color=COLORS["self"],
        fillcolor="rgba(31,119,180,0.15)",
    ))

    if show_sup:
        sup_values = [review.get(k, 0) for k in EVAL_KEYS_SUP]
        if any(v > 0 for v in sup_values):
            sup_values.append(sup_values[0])
            fig.add_trace(go.Scatterpolar(
                r=sup_values,
                theta=labels,
                fill="toself",
                name="指導者評価",
                line_color=COLORS["secondary"],
                fillcolor="rgba(255,127,14,0.15)",
            ))

    fig.update_layout(
        polar=dict(
            radialaxis=dict(visible=True, range=[0, 5], tickvals=[1, 2, 3, 4, 5]),
        ),
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5),
        **_base_layout(title, 450),
    )
    return fig


def radar_comparison(current, previous, title="前回比較レーダーチャート"):
    """前回比較レーダーチャート"""
    labels = EVAL_LABELS + [EVAL_LABELS[0]]

    cur_values = [current.get(k, 0) for k in EVAL_KEYS_SELF]
    cur_values.append(cur_values[0])

    prev_values = [previous.get(k, 0) for k in EVAL_KEYS_SELF]
    prev_values.append(prev_values[0])

    cur_label = f"{current['fiscal_year']}年度 {current['quarter']}Q"
    prev_label = f"{previous['fiscal_year']}年度 {previous['quarter']}Q"

    fig = go.Figure()
    fig.add_trace(go.Scatterpolar(
        r=prev_values, theta=labels, fill="toself",
        name=prev_label, line_color="#aaaaaa", fillcolor="rgba(170,170,170,0.1)",
    ))
    fig.add_trace(go.Scatterpolar(
        r=cur_values, theta=labels, fill="toself",
        name=cur_label, line_color=COLORS["primary"], fillcolor="rgba(31,119,180,0.15)",
    ))

    fig.update_layout(
        polar=dict(radialaxis=dict(visible=True, range=[0, 5], tickvals=[1, 2, 3, 4, 5])),
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5),
        **_base_layout(title, 450),
    )
    return fig


def activity_trend_chart(reviews, title="活動実績推移"):
    """活動実績の推移グラフ（棒グラフ + 折れ線）"""
    if not reviews:
        return go.Figure()

    periods = [f"{r['fiscal_year']}年度{r['quarter']}Q" for r in reviews]
    fig = go.Figure()

    colors = px.colors.qualitative.Set2
    for i, (key, label) in enumerate(zip(ACTIVITY_KEYS, ACTIVITY_LABELS)):
        values = [r.get(key, 0) for r in reviews]
        fig.add_trace(go.Bar(
            x=periods, y=values, name=label,
            marker_color=colors[i % len(colors)],
        ))

    fig.update_layout(
        barmode="group",
        xaxis_title="",
        yaxis_title="件数",
        legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5),
        **_base_layout(title, 400),
    )
    return fig


def activity_line_chart(reviews, title="活動量推移（折れ線）"):
    """活動量の推移折れ線グラフ"""
    if not reviews:
        return go.Figure()

    periods = [f"{r['fiscal_year']}年度{r['quarter']}Q" for r in reviews]
    fig = go.Figure()

    for key, label in zip(ACTIVITY_KEYS, ACTIVITY_LABELS):
        values = [r.get(key, 0) for r in reviews]
        fig.add_trace(go.Scatter(
            x=periods, y=values, name=label, mode="lines+markers",
        ))

    fig.update_layout(
        xaxis_title="",
        yaxis_title="件数",
        legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5),
        **_base_layout(title, 380),
    )
    return fig


def eval_gap_chart(review, title="自己評価と指導者評価のギャップ"):
    """自己評価と指導者評価の差を棒グラフで表示"""
    self_values = [review.get(k, 0) for k in EVAL_KEYS_SELF]
    sup_values = [review.get(k, 0) for k in EVAL_KEYS_SUP]

    if not any(v > 0 for v in sup_values):
        return None

    gaps = [s - p for s, p in zip(self_values, sup_values)]
    colors = [COLORS["danger"] if abs(g) >= 2 else ("#ffcc00" if abs(g) >= 1 else COLORS["success"]) for g in gaps]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=EVAL_LABELS, y=gaps, name="ギャップ（自己 - 指導者）",
        marker_color=colors,
        text=[f"{g:+d}" for g in gaps],
        textposition="outside",
    ))
    fig.add_hline(y=0, line_dash="dash", line_color="gray")

    fig.update_layout(
        xaxis_title="",
        yaxis_title="評価差（自己 - 指導者）",
        yaxis=dict(range=[-4, 4]),
        showlegend=False,
        **_base_layout(title, 380),
    )
    return fig


def activity_eval_balance(review, title="活動量と自己評価のバランス"):
    """活動量（合計）と自己評価平均のバランス表示"""
    total_activity = sum(review.get(k, 0) for k in ACTIVITY_KEYS)
    avg_self = sum(review.get(k, 0) for k in EVAL_KEYS_SELF) / len(EVAL_KEYS_SELF)

    # 活動量を5段階に正規化（目安: 合計100件=5点換算）
    norm_activity = min(total_activity / 20, 5)

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=["活動量（正規化）", "自己評価平均"],
        y=[norm_activity, avg_self],
        marker_color=[COLORS["primary"], COLORS["secondary"]],
        text=[f"{norm_activity:.1f}", f"{avg_self:.1f}"],
        textposition="outside",
    ))

    fig.update_layout(
        yaxis=dict(range=[0, 5.5]),
        showlegend=False,
        **_base_layout(title, 350),
    )
    return fig


def eval_trend_chart(reviews, title="自己評価推移"):
    """自己評価の各項目の推移折れ線"""
    if not reviews:
        return go.Figure()

    periods = [f"{r['fiscal_year']}年度{r['quarter']}Q" for r in reviews]
    fig = go.Figure()

    for key, label in zip(EVAL_KEYS_SELF, EVAL_LABELS):
        values = [r.get(key, 0) for r in reviews]
        fig.add_trace(go.Scatter(
            x=periods, y=values, name=label, mode="lines+markers",
        ))

    fig.update_layout(
        xaxis_title="",
        yaxis_title="評価点",
        yaxis=dict(range=[0, 5.5], dtick=1),
        legend=dict(orientation="h", yanchor="bottom", y=-0.35, xanchor="center", x=0.5),
        **_base_layout(title, 420),
    )
    return fig
