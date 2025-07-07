resource "aws_iam_group" "developers" {
  name = "developers"
  path = "/developers/"
}

resource "aws_iam_group" "admins" {
  name = "admins"
  path = "/admin/"
}

resource "aws_iam_group_policy_attachment" "developers_poweruser_access" {
  group      = aws_iam_group.developers.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_group_policy_attachment" "admins_administrator_access" {
  group      = aws_iam_group.admins.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
