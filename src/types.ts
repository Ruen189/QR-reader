/** Дополнительные данные о распознанном коде. */
export interface ScanDetails {
  /** Кадр (data URL), на котором подсвечена область найденного кода. */
  imageUrl?: string;
  /** Человекочитаемое имя формата кода, напр. «QR_CODE» или «EAN_13». */
  format?: string;
}
