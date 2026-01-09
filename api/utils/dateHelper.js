/**
 * Helper functions untuk format date dengan timezone GMT+7 (Indonesia/Jakarta)
 */

/**
 * Get current date/time dalam format ISO dengan timezone GMT+7
 * @returns {string} ISO string dengan timezone GMT+7
 */
function getJakartaISOString() {
  const now = new Date();
  // Get timezone offset dalam minutes (bisa negatif atau positif)
  const localOffset = now.getTimezoneOffset(); // dalam minutes
  // Jakarta offset adalah -420 minutes (GMT+7 = UTC+7 = -420 minutes dari UTC)
  const jakartaOffset = -420; // GMT+7 = -420 minutes
  // Hitung offset difference
  const offsetDiff = (jakartaOffset - localOffset) * 60 * 1000; // convert ke milliseconds
  // Buat date dengan offset Jakarta
  const jakartaTime = new Date(now.getTime() + offsetDiff);
  
  // Format manual ke ISO dengan timezone +07:00
  const year = jakartaTime.getUTCFullYear();
  const month = String(jakartaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jakartaTime.getUTCDate()).padStart(2, '0');
  const hours = String(jakartaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(jakartaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jakartaTime.getUTCSeconds()).padStart(2, '0');
  const ms = String(jakartaTime.getUTCMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+07:00`;
}

/**
 * Get current timestamp dalam milliseconds (untuk kompatibilitas)
 * Timestamp selalu dalam UTC, jadi tidak perlu diubah
 * @returns {number} Timestamp dalam milliseconds
 */
function getJakartaTimestamp() {
  return Date.now();
}

/**
 * Format date ke string dengan timezone GMT+7
 * @param {Date} date - Date object (optional, default: now)
 * @param {string} format - Format output (optional, default: 'iso')
 * @returns {string} Formatted date string
 */
function formatJakartaDate(date = new Date(), format = 'iso') {
  if (format === 'iso') {
    const localOffset = date.getTimezoneOffset();
    const jakartaOffset = -420;
    const offsetDiff = (jakartaOffset - localOffset) * 60 * 1000;
    const jakartaTime = new Date(date.getTime() + offsetDiff);
    
    const year = jakartaTime.getUTCFullYear();
    const month = String(jakartaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jakartaTime.getUTCDate()).padStart(2, '0');
    const hours = String(jakartaTime.getUTCHours()).padStart(2, '0');
    const minutes = String(jakartaTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(jakartaTime.getUTCSeconds()).padStart(2, '0');
    const ms = String(jakartaTime.getUTCMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+07:00`;
  }
  
  return getJakartaISOString();
}

/**
 * Get current date/time dalam format yang lebih readable untuk Indonesia
 * @returns {string} Formatted date string (contoh: "2024-01-15 14:30:00 WIB")
 */
function getJakartaDateTimeString() {
  const now = new Date();
  const localOffset = now.getTimezoneOffset();
  const jakartaOffset = -420;
  const offsetDiff = (jakartaOffset - localOffset) * 60 * 1000;
  const jakartaTime = new Date(now.getTime() + offsetDiff);
  
  const year = jakartaTime.getUTCFullYear();
  const month = String(jakartaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jakartaTime.getUTCDate()).padStart(2, '0');
  const hours = String(jakartaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(jakartaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jakartaTime.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} WIB`;
}

module.exports = {
  getJakartaISOString,
  getJakartaTimestamp,
  formatJakartaDate,
  getJakartaDateTimeString
};

