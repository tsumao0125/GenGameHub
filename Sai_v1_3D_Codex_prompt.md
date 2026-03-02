# Codex向け 実装指示プロンプト（Sai v1 3D版 / Three.js + Rapier）

> そのまま **Codex に貼り付けて**使う想定の実装依頼プロンプトです。  
> 出力ファイルは **sai.html** とすること（index.htmlではない）。  
> 目的：360度カメラで見回せる本物の3D石積みv1を実装。

---

## ✅ Codexに貼るプロンプト（コピペ用）

以下をそのままCodexに貼ってください：

---

あなたは熟練したWebGLゲーム開発者です。
Three.js + Rapier（3D物理）を使用して、ブラウザで動く3D石積みゲーム「Sai」のv1を実装してください。

# 出力要件（最重要）
- 出力ファイル名は **sai.html**
- 単一ファイルで完結（ビルド不要）
- 外部ライブラリはCDNから読み込む
- Three.jsで3D描画
- OrbitControlsで360度カメラ操作
- Rapier 3D（WASM）で物理シミュレーション

# 使用CDN（例）
Three.js:
https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js

OrbitControls:
https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js

Rapier 3D:
https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.js

# 基本仕様

## カメラ
- OrbitControlsで360度回転可能
- ズーム可能
- 右ドラッグ：カメラ回転
- 左ドラッグ：石を掴む（物理オブジェクト操作中はカメラ無効）

## 石
- 見た目：ランダムにスケール変化したBoxGeometryまたはDodecahedron
- 当たり判定：Rapierのbox colliderでOK（v1は単純形状）
- 摩擦高め（0.8前後）
- 反発低め（0.05以下）
- density適度

## 操作
- レイキャストで石を選択
- ドラッグ中はカーソル位置に追従（キネマティックボディ使用）
- Spaceで手放す（dynamicに戻す）
- Q/EでY軸回転
- Rで現在の石を破棄して再生成

## ゲームルール
- 地面は固定剛体
- 石が地面より大きく落下したら終了
- 石が安定（speedとangularVelocityが閾値未満を1秒維持）したら次の石生成
- stackCountを表示

## 安定判定
- linear velocity length < 0.15
- angular velocity length < 0.1
- 1秒継続で確定

## ロケーション差（最低限）
3つ用意：river / mountain / coast

- river: 風弱（横力を周期的に加える）
- mountain: 風強
- coast: 風中 + 微小上下振動

## UI（最低限）
- 左上：ロケーション名
- 右上：Stack数
- 画面中央上部：安定ゲージ（簡易バー）
- 終了時：オーバーレイで結果表示 + 再スタートボタン

## 物理更新
- animation loop内で
  - world.step()
  - three.js meshをrapier rigid body位置へ同期

## コード構造
- init()
- createGround()
- spawnStone()
- handleInput()
- updatePhysics()
- checkStability()
- render()
- animate()

可読性を重視し、重要パラメータは const TUNING = {} にまとめる。

# セルフチェック（生成後確認）
- ブラウザでsai.htmlを開くだけで動作
- カメラ360度回転可能
- 石を掴んで回して落とせる
- 崩れる
- 安定で次石生成
- 最低限のUI表示あり

---

出力は **sai.htmlの完全なコードのみ**。説明文は不要。
