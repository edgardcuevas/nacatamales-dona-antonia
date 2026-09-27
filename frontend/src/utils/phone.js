export function formatWhatsappNumber(whatsappNumber) {
  if (!whatsappNumber) {
    return null
  }

  const digits = whatsappNumber.replace(/\D/g, '')

  if (digits.length <= 8) {
    return digits
  }

  const local = digits.slice(-8)
  const countryCode = digits.slice(0, -8)
  return `+${countryCode} ${local.slice(0, 4)}-${local.slice(4)}`
}