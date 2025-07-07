resource "aws_vpc" "main_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-main-vpc-${var.environment}"
  }
}

# --- Public Subnets ---
resource "aws_subnet" "public_us_west_1a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 0)
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "${var.project_name}-${var.environment}-public-${var.aws_region}a"
    Tier = "Public"
  }
}

resource "aws_subnet" "public_us_west_1c" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone       = "${var.aws_region}c"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-${var.aws_region}c"
    Tier = "Public"
  }
}

# --- Private Subnets ---
resource "aws_subnet" "private_us_west_1a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 2)
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "${var.project_name}-${var.environment}-private-${var.aws_region}a"
    Tier = "Private"
  }
}

resource "aws_subnet" "private_us_west_1c" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 3)
  availability_zone = "${var.aws_region}c"

  tags = {
    Name = "${var.project_name}-${var.environment}-private-${var.aws_region}c"
    Tier = "Private"
  }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-igw"
    Tier = "Public"
  }
}

resource "aws_eip" "nat_eip" {
  tags = {
    Name = "${var.project_name}-${var.environment}-nat-eip"
    Tier = "Public"
  }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = aws_subnet.public_us_west_1a.id

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-gw"
    Tier = "Public"

  }

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.main_vpc.id

  route = [
    {
      cidr_block                 = "0.0.0.0/0"
      nat_gateway_id             = aws_nat_gateway.nat.id
      carrier_gateway_id         = null
      destination_prefix_list_id = null
      egress_only_gateway_id     = null
      gateway_id                 = null
      instance_id                = null
      ipv6_cidr_block            = null
      local_gateway_id           = null
      network_interface_id       = null
      transit_gateway_id         = null
      vpc_endpoint_id            = null
      vpc_peering_connection_id  = null
      core_network_arn           = null
    },
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-private-rt"
    Tier = "Private"
  }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main_vpc.id

  route = [
    {
      cidr_block                 = "0.0.0.0/0"
      gateway_id                 = aws_internet_gateway.igw.id
      nat_gateway_id             = null
      carrier_gateway_id         = null
      destination_prefix_list_id = null
      egress_only_gateway_id     = null
      instance_id                = null
      ipv6_cidr_block            = null
      local_gateway_id           = null
      network_interface_id       = null
      transit_gateway_id         = null
      vpc_endpoint_id            = null
      vpc_peering_connection_id  = null
      core_network_arn           = null
    },
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-public-rt"
    Tier = "Public"
  }
}

# --- Route Table Associations ---
resource "aws_route_table_association" "private_us_west_1a_association" {
  subnet_id      = aws_subnet.private_us_west_1a.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_us_west_1c_association" {
  subnet_id      = aws_subnet.private_us_west_1c.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "public_us_west_1a_association" {
  subnet_id      = aws_subnet.public_us_west_1a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_us_west_1c_association" {
  subnet_id      = aws_subnet.public_us_west_1c.id
  route_table_id = aws_route_table.public_rt.id
}