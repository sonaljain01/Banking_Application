import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description?: string;
  createdAt: Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  contact: string;
  accountNumber: string;
  balance: number;
  transactions: Transaction[];
}

export async function POST(request: NextRequest) {
  const { recipientAccountNumber, amount, description } = await request.json();

  if (!recipientAccountNumber || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  const token = request.cookies.get('token')?.value || '';

  try {
    const decodedToken: any = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const userId = decodedToken.id;

    // Find the user making the transfer
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      include: { transactions: true },
    });

    if (!sender) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the recipient user
    const recipient = await prisma.user.findUnique({
      where: { accountNumber: recipientAccountNumber },
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // Calculate sender's current balance
    const senderBalance = sender.balance;

    console.log(`Sender Balance: ${senderBalance}`);
    console.log(`Requested Transfer Amount: ${amount}`);

    // Check if the sender has sufficient funds
    if (senderBalance < amount) {
      return NextResponse.json({ error: 'Insufficient funds' }, { status: 400 });
    }

    // Update the balances
    await prisma.user.update({
      where: { id: userId },
      data: { balance: senderBalance - amount },
    });

    const recipientBalance = recipient.balance;

    await prisma.user.update({
      where: { accountNumber: recipientAccountNumber },
      data: { balance: recipientBalance + amount },
    });

    // Create the credit transaction for the recipient
    await prisma.transaction.create({
      data: {
        userId: recipient.id,
        type: 'credit',
        amount,
        description,
      },
    });

    // Create the debit transaction for the sender
    await prisma.transaction.create({
      data: {
        userId: sender.id,
        type: 'debit',
        amount,
        description,
      },
    });

    return NextResponse.json({ message: 'Fund transfer successful' }, { status: 200 });
  } catch (error) {
    console.error('Error during fund transfer:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
