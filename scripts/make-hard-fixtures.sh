#!/usr/bin/env bash
# Genera foto di prova "difficili" (come scatti veri col telefono) con ImageMagick.
# Servono al banco di misura tests/ocr-bench.cjs: piccole, inclinate, poco
# contrasto, con riflessi, timbro data minuscolo. Non entrano nel repo: si
# rigenerano con npm run fixtures:hard.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/hard
mkdir -p "$OUT"

FONT=DejaVu-Sans
FONTB=DejaVu-Sans-Bold

# 1) Fronte fotografato da lontano: testo piccolo in una foto grande (550px di testo su 1080)
convert -size 1080x760 xc:'#efe9d8' \
  -fill '#8d1b12' -font $FONTB -pointsize 24 -gravity northwest \
  -annotate '+40+30' 'RIGATONI' -annotate '+40+62' 'DI GRANO DURO' \
  -fill '#33332b' -font $FONT -pointsize 13 -annotate '+42+96' 'BARILLA S.p.A.' \
  -pointsize 11 -annotate '+42+116' 'Via Mantova 20, Parma' \
  -fill '#2f5d3a' -font $FONTB -pointsize 15 -annotate '+42+700' 'PESO NETTO 500 g' \
  -attenuate 0.08 +noise Gaussian -quality 88 "$OUT/fronte-piccolo.jpg"

# 2) Fronte inclinato di 8 gradi (scatto sbilencaato)
convert -size 1000x620 xc:'#f4eeda' \
  -fill '#8d1b12' -font $FONTB -pointsize 78 -gravity northwest \
  -annotate '+60+70' 'PENNE RIGATE' \
  -fill '#3b3b33' -font $FONT -pointsize 30 -annotate '+62+268' 'DE CECCO S.p.A.' \
  -fill '#2f5d3a' -font $FONTB -pointsize 36 -annotate '+62+520' 'PESO NETTO 500 g' \
  -rotate 8 -background '#d8d2c0' -attenuate 0.1 +noise Gaussian -quality 86 "$OUT/fronte-inclinato.jpg"

# 3) Fronte a bassissimo contrasto (testo grigio chiaro su bianco, foto cupa)
convert -size 1000x620 xc:'#f2f2f0' \
  -fill '#a8a8a4' -font $FONTB -pointsize 72 -gravity northwest \
  -annotate '+60+70' 'FARINA 00' \
  -fill '#9a9a96' -font $FONT -pointsize 30 -annotate '+62+268' 'MOLINO CHIARI' \
  -fill '#9a9a96' -font $FONTB -pointsize 34 -annotate '+62+520' 'PESO NETTO 1000 g' \
  -modulate 62 -quality 86 "$OUT/fronte-cupo.jpg"

# 4) Riflesso luminoso diagonale sopra la zona del nome (plastica lucida):
# forte ma non saturo, come i riflessi veri che lasciano intravedere la scritta.
convert -size 1000x620 xc:'#eef0f2' \
  -fill '#153a6b' -font $FONTB -pointsize 76 -gravity northwest \
  -annotate '+60+70' 'LATTE INTERO' \
  -fill '#3b3b33' -font $FONT -pointsize 30 -annotate '+62+268' 'GRANAROLO S.p.A.' \
  -fill '#2f5d3a' -font $FONTB -pointsize 34 -annotate '+62+520' '1000 ml' \
  \( -size 1000x620 xc:black -fill 'gray(235)' -draw 'polygon 0,0 620,0 240,620 0,620' -blur 0x40 \) \
  -compose screen -composite -quality 86 "$OUT/fronte-riflesso.jpg"

# 5) Timbro data inkjet minuscolo sul fondo di una lattina (testo 14px, punto, su fondo scuro)
convert -size 900x700 xc:'#3d3f42' \
  -fill '#c9ccd0' -font $FONT -pointsize 20 -gravity northwest \
  -annotate '+60+80' 'ACQUA PANNA' \
  -annotate '+60+120' 'MINERALE NATURALE' \
  -annotate '+60+160' '0,75 L  PET 100% RICICLATO' \
  -fill '#e8ebee' -font $FONTB -pointsize 14 \
  -annotate '+320+640' 'SCAD. 18.04.2027 10:34' \
  -attenuate 0.15 +noise Gaussian -quality 88 "$OUT/timbro-minuscolo.jpg"

# 6) Retro yogurt con data piccola, foto sfocata (blur leggero ma percepibile)
convert -size 900x600 xc:white \
  -fill black -font $FONT -pointsize 26 -gravity northwest \
  -annotate '+45+40' 'Da consumare entro il:' \
  -font $FONTB -pointsize 34 -annotate '+45+85' '05/07/2027' \
  -font $FONT -pointsize 24 -annotate '+45+140' 'Yogurt bianco intero.' \
  -annotate '+45+180' 'Conservare in frigorifero.' \
  -annotate '+45+220' 'Prodotto da Sterilgarda S.p.A.' \
  -attenuate 0.12 +noise Gaussian -blur 0x1.1 -quality 86 "$OUT/data-sfocata.jpg"

# 7) Foto scura/underesposta con data chiara su fondo scuro (tappo yogurth)
convert -size 900x600 xc:'#20242c' \
  -fill '#8b9099' -font $FONT -pointsize 22 -gravity northwest \
  -annotate '+50+60' 'LOTTO L260418' \
  -annotate '+50+100' 'PRODOTTO IL 10.04.2027' \
  -fill '#c4c9d2' -font $FONTB -pointsize 26 -annotate '+50+170' 'DA CONSUMARSI ENTRO 18/04/2027' \
  -modulate 45 -attenuate 0.18 +noise Gaussian -quality 86 "$OUT/data-scura.jpg"

# 8) Etichetta ruotata di 90 gradi (scatto in verticale col timbro di lato)
convert -size 900x600 xc:white \
  -fill black -font $FONT -pointsize 30 -gravity northwest \
  -annotate '+45+45' 'Da consumarsi preferibilmente entro:' \
  -font $FONTB -pointsize 40 -annotate '+45+100' '30/06/2027' \
  -font $FONT -pointsize 24 -annotate '+45+160' 'Panna da cucina Sterilgarda.' \
  -rotate 90 -background white -quality 88 "$OUT/data-ruotata-90.jpg"

echo "Foto hard generate in $OUT"
