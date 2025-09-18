variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Name prefix for all resources"
  type        = string
  default     = "alerting-dev"
}

variable "tags" {
  description = "Common tags to apply to resources"
  type        = map(string)
  default     = {
    "app"   = "alerting-min-v1"
    "owner" = "dev-infra"
  }
}


variable "github_repo" {
  description = "GitHub repo to create issues in (format: org/repo)"
  type        = string
  default     = "pytorch/alerting-infra"
}

variable "enable_github_issues" {
  description = "Enable GitHub issue creation (set to false for testing)"
  type        = bool
  default     = false
}
