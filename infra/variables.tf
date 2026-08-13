variable "cutover" {
  description = <<-EOT
    The 2026-08-11 migration switch. true (the default since the cutover
    happened) = the schengen.live alias and apex DNS point at this
    distribution. false was only used to build the stack dark before the
    `aws cloudfront associate-alias` move — never set it back: that would
    re-point live DNS at the legacy shared distribution.
  EOT
  type        = bool
  default     = true
}
