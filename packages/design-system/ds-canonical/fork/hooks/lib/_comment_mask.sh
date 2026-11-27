#!/bin/bash
# 共用註解遮罩(2026-11-27,上游判定 E16 + E14 第 (1) 點)。
#
# 掃「寫法」的 hook 不該把註解裡的字當成程式:以前 opacity / layout-space 兩支逐行掃整段內容、consumer 品質的 ANY_HITS
# 只跳過「開頭就是註解」的行,寫在 {/* … */} 或行尾 // 的說明文字照樣被判違規,逼產品加豁免標記(而豁免有全 repo 上限)。
#
# governance_mask_comments [drop_marker] < text
#   把 //…、/*…*/、{/*…*/} 換成等長空白(換行保留)→ 行號不變、每行長度不變。
#   給了 drop_marker 時,**原文**含該字串的行輸出成空行(豁免標記一律對原文判;遮罩後標記本身也是註解、會被抹掉)。
#   // 只在行首或空白 / ; , ) } > 之後才算註解:字串裡的 https:// 不算(否則會把同一行後面的程式一起遮掉 = 漏判)。
#   字串先跳過再認註解(2026-11-27 h26 規格核對 + r72):單引號 / 雙引號(同一行內)、反引號(可跨行),含 \ 跳脫,原樣保留 ——
#   以前字串裡的 /*(例 accept="image/*")或 " // " 會被當成註解開頭,一路遮到後面某個 */,中間的程式整段漏判。
#   單引號前一個字是英數字時(JSX 文字裡的 Don't)不當字串開頭。
#   全庫只有這一份實作:_micro_geometry.sh 解析 JSX 結構前也呼叫這支(不另寫第二份正規式)。
# 跟 check_consumer_code_quality.sh「先去註解再判結構、豁免標記對原文判」是同一套做法;這裡改成等長空白是為了行號不變。
governance_mask_comments() {
  local drop_marker="${1:-}"
  DROP_MARKER="$drop_marker" perl -e '
    local $/;
    my $text = <STDIN>;
    $text = "" unless defined $text;
    my @orig = split /\n/, $text, -1;
    sub blank { my $m = shift; $m =~ s/[^\n]/ /g; return $m }
    (my $masked = $text) =~ s#((?<![A-Za-z0-9_])\x27(?:[^\x27\\\n]|\\.)*\x27|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\{/\*.*?\*/\})|(/\*.*?\*/)|((?:^|(?<=[\s;,)}>]))//[^\n]*)#defined $1 ? $1 : blank($&)#gsme;
    my @lines = split /\n/, $masked, -1;
    my $marker = $ENV{DROP_MARKER};
    if (defined $marker && length $marker) {
      for my $i (0 .. $#orig) { $lines[$i] = "" if index($orig[$i], $marker) >= 0 }
    }
    print join("\n", @lines);
  '
}
