import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBAssetItem } from '../models/asset.js';

const TABLE_NAME = 'WageTable';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566', // LocalStack - change for production
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

const dynamodb = DynamoDBDocumentClient.from(client);

const assetsData = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    mic_code: 'XNGS',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    employees: 164000,
    website: 'https://www.apple.com',
    description:
      "Apple Inc. is a leading corporation renowned for crafting and delivering a diverse array of technology products on a global scale. Specializing in consumer electronics, Apple's flagship products include the iPhone, a series of smartphones that have significantly influenced mobile communication. Complementing this is their line of Mac computers, which blend powerful processors with the macOS operating system distinguished for its sleek design and robust performance. Apple also offers iPad tablets, noted for their versatility in both personal and professional settings, and wearables such as AirPods and the Apple Watch, which have expanded the company's reach into the personal accessories market. Beyond hardware, Apple operates a robust ecosystem of services like the App Store, a digital distribution platform for apps, and Apple Music, a significant player in the music streaming industry. By constantly innovating in hardware and digital services, Apple Inc. maintains its stature within the consumer technology sector and continues to wield substantial influence over market dynamics and consumer tech trends worldwide.",
    type: 'Common Stock',
    CEO: 'Mr. Timothy D. Cook',
    address: 'One Apple Park Way',
    address2: '',
    city: 'Cupertino',
    zip: '95014',
    state: 'CA',
    country: 'United States',
    phone: '(408) 996-1010',
  },
  {
    symbol: 'META',
    name: 'Meta Platforms, Inc. Class A',
    exchange: 'NASDAQ',
    mic_code: 'XNGS',
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    employees: 76834,
    website: 'https://investor.atmeta.com',
    description:
      "Meta Platforms Inc., commonly known as Meta, is a leading technology conglomerate focused on building integrated social media and technology solutions. The company owns and operates several pivotal platforms such as Facebook, Instagram, WhatsApp, and Oculus, which serve billions of users globally, making it a cornerstone in the digital communication and social networking industries. Meta is renowned for its continuous innovation in connecting people and businesses through its expansive suite of applications and services. A defining feature of Meta is its ambitious development of the metaverse, a virtual reality space where users can interact in a computer-generated environment, highlighting the company's commitment to pioneering new forms of digital interaction. Meta plays a significant role in digital marketing as one of the largest advertising platforms, providing businesses with tools to reach targeted audiences. This positions Meta as a crucial player in shaping the future of digital communication, social interaction, and virtual environments on a global scale.",
    type: 'Common Stock',
    CEO: 'Mr. Mark Elliot Zuckerberg',
    address: '1 Meta Way',
    address2: '',
    city: 'Menlo Park',
    zip: '94025',
    state: 'CA',
    country: 'United States',
    phone: '650 543 4800',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    exchange: 'NASDAQ',
    mic_code: 'XNGS',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    employees: 125665,
    website: 'https://www.tesla.com',
    description:
      'Tesla Inc. is a leading manufacturer and innovator in the electric vehicle space, known for its cutting-edge technology and commitment to sustainable energy. As a pioneering force in the automotive industry, Tesla produces a range of electric vehicles (EVs), including sedans like the Model S, Model 3, and luxury SUVs such as the Model X and Model Y. Beyond automobiles, Tesla focuses on energy solutions through products like Solar Roof, solar panels, and energy storage systems with the Powerwall, Powerpack, and Megapack. Tesla plays a substantial role in the push towards reducing carbon emissions and advancing renewable energy. With a strong global footprint, the company is at the forefront of technological advancements in battery technology, autonomous driving, and artificial intelligence. The continuous expansion of its Supercharger network also supports sustainable transportation by providing accessible and efficient EV charging solutions worldwide. Founded in 2003 and headquartered in Palo Alto, California, Tesla is transformative in both the automotive and energy sectors, propelling the transition to greener technologies.',
    type: 'Common Stock',
    CEO: 'Mr. Elon R. Musk',
    address: '1 Tesla Road',
    address2: '',
    city: 'Austin',
    zip: '78725',
    state: 'TX',
    country: 'United States',
    phone: '512 516 8177',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    exchange: 'NASDAQ',
    mic_code: 'XNGS',
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    employees: 1560000,
    website: 'https://www.aboutamazon.com',
    description:
      "Amazon.com Inc. is a global leader in e-commerce and cloud computing services. Founded in 1994, the company has redefined retail by offering an extensive selection of products and services through its online marketplace, which serves millions of customers worldwide. Known for customer-centric innovation, Amazon continuously enhances its platform with features such as personalized recommendations, same-day delivery, and convenient payment solutions. Besides its retail arm, Amazon Web Services (AWS) plays a pivotal role in the cloud computing sector, providing scalable and reliable IT infrastructure for startups, enterprises, and government entities. AWS is a key driver of Amazon's profitability and a major player in the technology industry. By diversifying into sectors like artificial intelligence, streaming media through Amazon Prime, and logistics with its delivery network, Amazon maintains a significant impact on multiple industries. Its continuous expansion and strategic acquisitions underpin its leading position in the market and influence on digital commerce and technological advancements globally.",
    type: 'Common Stock',
    CEO: 'Mr. Andrew R. Jassy',
    address: '410 Terry Avenue North',
    address2: '',
    city: 'Seattle',
    zip: '98109-5210',
    state: 'WA',
    country: 'United States',
    phone: '206 266 1000',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    exchange: 'NASDAQ',
    mic_code: 'XNGS',
    sector: 'Technology',
    industry: 'Software - Infrastructure',
    employees: 228000,
    website: 'https://www.microsoft.com',
    description:
      "Microsoft Corp. is a multinational technology corporation that develops, licenses, and supports a diverse range of software products, services, and hardware. At the forefront of its offerings is the Windows operating system, a fundamental platform for personal computing used globally. The company also provides productivity software, such as Microsoft Office, which includes widely utilized applications like Word, Excel, and PowerPoint. Microsoft's Azure cloud platform plays a significant role in the competitive cloud computing market, providing infrastructure, platforms, and services for businesses of all sizes. Additionally, Microsoft's involvement extends to gaming with its Xbox gaming consoles and a suite of gaming software and online services. Microsoft operates globally, serving individual consumers, small to medium-sized enterprises, and large corporations with enterprise-level solutions. Established in 1975 and headquartered in Redmond, Washington, Microsoft Corp. continues to influence software, cloud technology, and gaming industries, contributing significantly to technological advancements worldwide.",
    type: 'Common Stock',
    CEO: 'Mr. Satya  Nadella',
    address: 'One Microsoft Way',
    address2: '',
    city: 'Redmond',
    zip: '98052-6399',
    state: 'WA',
    country: 'United States',
    phone: '425 882 8080',
  },
];

async function persistAssets() {
  const currentTimestamp = new Date().toISOString();

  // Transform the asset data to match DynamoDBAssetItem interface
  const dynamoItems: DynamoDBAssetItem[] = assetsData.map(asset => ({
    PK: 'ASSET#STOCK' as const,
    SK: asset.symbol,
    EntityType: 'Asset' as const,
    AssetType: 'STOCK' as const,
    Symbol: asset.symbol,
    name: asset.name,
    currentPrice: 0, // Placeholder - will be updated by price service
    lastUpdated: currentTimestamp,
    description: asset.description,
    exchange: asset.exchange,
    mic_code: asset.mic_code,
    sector: asset.sector,
    industry: asset.industry,
    employees: asset.employees,
    website: asset.website,
    type: asset.type,
    CEO: asset.CEO,
    address: asset.address,
    address2: asset.address2 || undefined,
    city: asset.city,
    zip: asset.zip,
    state: asset.state,
    country: asset.country,
    phone: asset.phone,
  }));

  // Use batch write for efficiency
  const putRequests = dynamoItems.map(item => ({
    PutRequest: {
      Item: item,
    },
  }));

  try {
    console.log('🔨 Persisting assets to DynamoDB...');

    await dynamodb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: putRequests,
        },
      })
    );

    console.log('✅ Successfully persisted all 5 assets:');
    dynamoItems.forEach(item => {
      console.log(`   • ${item.Symbol} - ${item.name}`);
    });
  } catch (error) {
    console.error('❌ Error persisting assets:', error);
    process.exit(1);
  }
}

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  persistAssets()
    .then(() => {
      console.log('🎉 Asset persistence completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { persistAssets };
