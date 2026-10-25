# Radio France

## Überblick

Diese Integration zeigt in Gladys, was gerade auf den Sendern von **Radio France** läuft: France Inter, franceinfo, France Culture, France Musique, FIP, Mouv’, die Lokalsender **ICI** (früher France Bleu) und die Webradios. Für jeden verfolgten Sender bekommst du die Sendung, die laufende Rubrik (Nachrichten, eine Kolumne) und den Titel, und deine Szenen können reagieren, wenn eine neue Sendung, Rubrik oder ein neuer Titel beginnt.

Die Daten stammen aus der offiziellen **Open API** von Radio France, mit deinem eigenen API-Schlüssel. Die Integration ist **inoffiziell und steht in keiner Verbindung zu Radio France**. Sie spielt keinen Stream ab: Die Open API darf nicht zum Live-Hören genutzt werden.

### Nutzungsbedingungen

Wer die Open API nutzt, akzeptiert ihre Bedingungen: ein persönlicher Schlüssel, private und nicht kommerzielle Nutzung, Daten unverändert angezeigt und nie gespeichert, und der Hinweis **„données fournies par l’Open API Radio France“** (Daten bereitgestellt von der Open API von Radio France), den jedes Widget der Integration zeigt. Die Integration hält die Daten nur im Arbeitsspeicher, höchstens eine Stunde; `/data` enthält nur ihren Anfragenzähler und deine Verfolgen-Schalter. Es wird kein Logo von Radio France verwendet.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein kostenloser, persönlicher **Open-API-Schlüssel**: Jeder Gladys-Benutzer beantragt seinen eigenen.
- Internetzugang von Gladys aus (die Anfragen gehen an `openapi.radiofrance.fr`).

### Deinen Open-API-Schlüssel erhalten

1. Lege ein Konto auf [developers.radiofrance.fr](https://developers.radiofrance.fr) an.
2. Klicke unter **Mein Konto** auf **API-Schlüssel beantragen**.
3. Gib den Namen deines Projekts an (zum Beispiel „Gladys zu Hause“) und seinen Zweck (zum Beispiel „anzeigen, was gerade läuft, auf meinem Smart-Home-Dashboard“).
4. Radio France prüft jeden Antrag von Hand und schickt den Schlüssel per E-Mail, oft am selben Tag.
5. Füge den Schlüssel in der Konfiguration der Integration ein, speichere und drücke dann **API-Schlüssel testen**.

## Konfiguration

| Feld                      | Standard    | Wirkung                                                                                                                                                     |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open-API-Schlüssel        | —           | Dein Schlüssel. Wird bei jeder Anfrage in einem Header an Radio France gesendet, nie wieder angezeigt und nie protokolliert.                                |
| Sprache der Texte         | Französisch | Funktionsnamen, Statusmeldungen und die Sätze der Szenenaktionen. Titel von Radio France werden nie übersetzt.                                              |
| Tagesbudget (Anfragen)    | 900         | Anfragen, die sich die Integration pro Tag erlaubt, von den 1.000 des Schlüssels (100 bis 1.000). Senke den Wert, wenn der Schlüssel anderswo genutzt wird. |
| Mindestabstand (Sekunden) | 90          | Nie zwei Abfragen in kürzerem Abstand (60 bis 600). Das Budget kann sie weiter auseinanderziehen.                                                           |

**API-Schlüssel testen** liest die Senderliste (eine Anfrage), aktualisiert den Tab Entdecken und zeigt die heute verbrauchten Anfragen.

## Verwendung

### Geräte

Öffne den Tab **Entdecken** der Integration und füge die gewünschten Sender hinzu. Die Liste kommt aus der API, mit den Namen, die Radio France ihnen gibt.

| Funktion  | Hinweise                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sendung   | Die laufende Sendung (ihr Name). Ein Strich, wenn es keine gibt: FIP und seine Webradios spielen meistens Musik ohne Sendung.                                       |
| Rubrik    | Die Rubrik innerhalb der Sendung: Nachrichten, eine Kolumne, ein Interview. Ein Strich zwischen zwei Rubriken.                                                      |
| Titel     | „Interpret – Titel“ des laufenden Stücks, auf den Musiksendern. Sonst ein Strich.                                                                                   |
| Verfolgen | Standardmäßig an. **Nur verfolgte Sender werden abgefragt.** Schalte ihn für Sender aus, die du nicht hörst, oder lass eine Szene ihn einschalten, wenn du zuhörst. |

### Kontingent und Abfragen

Ein Schlüssel erlaubt **1.000 Anfragen pro Tag**; darüber hinaus sperrt Radio France ihn bis zum nächsten Tag. Die Integration zählt jede Anfrage, die sie sendet, und fragt bis zu **10 Sender in einer einzigen Anfrage** ab. Sie wartet das Ende der laufenden Sendung, Rubrik oder des Titels ab, bevor sie erneut fragt (nie vor dem Mindestabstand, mindestens alle 15 Minuten), und verteilt die Anfragen auf den Rest des Tages, wenn das Budget knapp wird. Wenn nichts verfolgt wird, sendet sie keine Anfrage. Der Zähler wird vermutlich um **Mitternacht Pariser Zeit** zurückgesetzt (Radio France sagt es nicht).

Die Szenenaktionen, die Schaltfläche **Aktualisieren** und das Widget „Nächste Sendungen“ nutzen dasselbe Budget. Ist es aufgebraucht, sagen sie es und warten bis Mitternacht.

### Dashboard-Widgets

![Die Widgets der Integration: jetzt on air auf einem Wortsender und auf einem Musiksender, die nächsten Sendungen, die Nutzung der Open API (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-radio-france/main/docs/assets/widgets.de.png)

- **Jetzt on air**: Sendung, Folge, Rubrik, Titel, Ende der Sendung und Zeit der letzten Abfrage, mit einer Schaltfläche **Aktualisieren** (eine Anfrage, höchstens einmal pro Minute).
- **Nächste Sendungen**: die nächsten Sendungen eines Senders, aus seinem Programmraster (höchstens alle 15 Minuten gelesen). FIP und seine Webradios veröffentlichen ihr Programm nicht im Voraus.
- **Nutzung der Open API**: die heutigen Anfragen im Vergleich zum Budget, der Status (OK, Kontingentpause, Schlüssel abgelehnt…), die nächste Abfrage, die verfolgten Sender.

Wähle den Sender in den Einstellungen eines Widgets (standardmäßig der erste verfolgte Sender). Das Bild oben ist eine generierte Illustration mit erfundenen Sendungen, kein Screenshot.

### Szenen

Auslöser für die verfolgten Sender (von den regelmäßigen Abfragen erkannt, also bis zu einige Minuten nach dem Beginn; nie bei der ersten Abfrage nach einem Neustart):

- **Radio France: neuer Titel** — Titel, Interpret, Album, Jahr, Plattenlabel.
- **Radio France: Sendung beginnt** — Sendung, Titel der Folge, Zusammenfassung, Webseite, Endzeit.
- **Radio France: Rubrik beginnt** — dieselben Variablen, für Nachrichten, eine Kolumne, ein Interview.

Aktionen:

- **Radio France: was gerade läuft** — Sendung, Rubrik, Titel, Interpret, Album und Ende der Sendung, für eine Benachrichtigung oder eine Sprachnachricht.
- **Radio France: nächste Sendungen** — die nächsten Sendungen in den kommenden 12 Stunden, mit einem Satz zum Vorlesen („Demnächst auf France Inter: …“).

Beispiele: Wenn die 7-Uhr-Nachrichten auf France Inter beginnen, das Küchenradio lauter stellen; wenn ein neuer Titel auf FIP läuft, ihn auf dem Fernseher anzeigen; jeden Abend um 19 Uhr Gladys die Abendsendungen von France Culture vorlesen lassen.

## Fehlerbehebung

- **„Radio France lehnt den API-Schlüssel ab“**: Prüfe den Schlüssel (kein Leerzeichen davor oder danach). Ein neuer Schlüssel braucht manchmal einige Minuten. Die Integration versucht es nach 5 Minuten erneut, dann immer seltener (bis zu einer Stunde).
- **„Tageskontingent erreicht“ oder „Tagesbudget aufgebraucht“**: Alles wartet bis Mitternacht (Pariser Zeit). Verfolge weniger Sender, erhöhe den Mindestabstand oder prüfe, ob der Schlüssel nicht von einem anderen Programm genutzt wird.
- **„Die Open API antwortet nicht“**: Der Dienst oder dein Internetzugang ist gestört; die Integration versucht es etwas später erneut. Ein „Serverfehler“ kann auch bedeuten, dass das Kontingent des Schlüssels anderswo verbraucht wird.
- **Ein Sender wird nie aktualisiert**: Prüfe, ob sein Schalter **Verfolgen** an ist, und sieh dir das Widget „Nutzung der Open API“ an. Ein Sender, den Radio France aus seiner Liste entfernt hat, wird nicht mehr abgefragt.
- **FIP hat keine Sendung**: Das ist normal, FIP und seine Webradios spielen meist Musik ohne Sendung.
- Gib bei einem Problem die Versionen von Gladys und der Integration an, die Meldung von **API-Schlüssel testen** (sie zeigt nie den Schlüssel) und die Logs mit `DEBUG=gladys-integration-sdk`.
