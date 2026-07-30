from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
from reportlab.lib import colors

out = Path('specifications_android_webview.pdf')

title_style = ParagraphStyle(
    name='Title',
    fontName='Helvetica-Bold',
    fontSize=18,
    leading=22,
    spaceAfter=12,
    textColor=colors.HexColor('#0f172a'),
)
subtitle_style = ParagraphStyle(
    name='Subtitle',
    fontName='Helvetica',
    fontSize=11,
    leading=14,
    spaceAfter=10,
    textColor=colors.HexColor('#475569'),
)
body_style = ParagraphStyle(
    name='Body',
    fontName='Helvetica',
    fontSize=10.5,
    leading=14,
    spaceAfter=6,
    textColor=colors.HexColor('#1f2937'),
)

story = []
story.append(Paragraph('Spécifications minimales pour une APK Android WebView', style=title_style))
story.append(Paragraph('Cette liste sert à vérifier si un téléphone peut exécuter correctement une application Android WebView comme l’APK EcoleTrack.', style=subtitle_style))
story.append(Spacer(1, 8))

items = [
    'Système Android : Android 7.0 (Nougat) ou plus récent',
    'Processeur : processeur quad-core de 1,5 GHz ou plus recommandé',
    'RAM : 2 Go minimum, 3 Go ou plus recommandé',
    'Stockage : au moins 100 Mo d’espace libre',
    'Écran : résolution 720p ou plus recommandée',
    'Connectivité : Wi‑Fi ou réseau mobile actif',
    'Permissions : Internet et notifications autorisées',
    'Pour une expérience fluide : Android 9+ / 10+, 3 Go de RAM ou plus, processeur moderne et espace libre suffisant',
]

story.append(
    ListFlowable(
        [ListItem(Paragraph(item, style=body_style), bulletColor=colors.HexColor('#2563eb')) for item in items],
        bulletType='bullet',
        leftIndent=20,
        bulletFontName='Helvetica',
        bulletFontSize=10,
    )
)
story.append(Spacer(1, 12))
story.append(Paragraph('Note : un téléphone plus ancien ou avec peu de mémoire peut démarrer l’application, mais risque d’être lent ou instable.', style=body_style))

pdf = SimpleDocTemplate(str(out), pagesize=letter, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
pdf.build(story)
print(out.resolve())
