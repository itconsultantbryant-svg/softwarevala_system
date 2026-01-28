const db = require('../config/database');
const { sendNotificationToRole, sendNotificationToUser } = require('./notifications');

/**
 * Check for birthdays today and send notifications
 * This should be called daily (e.g., via cron job or scheduled task)
 */
async function checkAndSendBirthdayNotifications() {
  try {
    const today = new Date();
    const todayMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
    const todayDay = today.getDate();

    // Check if using PostgreSQL
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    
    // Get all staff with birthdays today
    // We need to check both staff table and users table
    let staffWithBirthdays;
    if (USE_POSTGRESQL) {
      staffWithBirthdays = await db.all(`
        SELECT 
          s.id as staff_id,
          s.user_id,
          s.date_of_birth,
          u.id as user_id_from_users,
          u.name,
          u.email,
          u.role
        FROM staff s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.date_of_birth IS NOT NULL
          AND EXTRACT(MONTH FROM s.date_of_birth) = $1
          AND EXTRACT(DAY FROM s.date_of_birth) = $2
      `, [todayMonth, todayDay]);
    } else {
      staffWithBirthdays = await db.all(`
        SELECT 
          s.id as staff_id,
          s.user_id,
          s.date_of_birth,
          u.id as user_id_from_users,
          u.name,
          u.email,
          u.role
        FROM staff s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.date_of_birth IS NOT NULL
          AND CAST(strftime('%m', s.date_of_birth) AS INTEGER) = ?
          AND CAST(strftime('%d', s.date_of_birth) AS INTEGER) = ?
      `, [todayMonth, todayDay]);
    }

    // Also check users table directly if they have date_of_birth
    // (in case some users don't have staff records)
    // Note: date_of_birth column may not exist in users table (it's in staff table)
    let usersWithBirthdays = [];
    try {
      // First check if date_of_birth column exists in users table
      let columnExists = false;
      if (USE_POSTGRESQL) {
        const columnCheck = await db.get(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name = 'date_of_birth'
          AND table_schema = 'public'
        `);
        columnExists = !!columnCheck;
      } else {
        const tableInfo = await db.all("PRAGMA table_info(users)");
        columnExists = tableInfo.some(col => col.name === 'date_of_birth');
      }
      
      if (columnExists) {
        if (USE_POSTGRESQL) {
          usersWithBirthdays = await db.all(`
            SELECT 
              u.id as user_id,
              u.name,
              u.email,
              u.role,
              u.date_of_birth
            FROM users u
            WHERE u.date_of_birth IS NOT NULL
              AND EXTRACT(MONTH FROM u.date_of_birth) = $1
              AND EXTRACT(DAY FROM u.date_of_birth) = $2
              AND NOT EXISTS (
                SELECT 1 FROM staff s WHERE s.user_id = u.id AND s.date_of_birth IS NOT NULL
              )
          `, [todayMonth, todayDay]);
        } else {
          usersWithBirthdays = await db.all(`
            SELECT 
              u.id as user_id,
              u.name,
              u.email,
              u.role,
              u.date_of_birth
            FROM users u
            WHERE u.date_of_birth IS NOT NULL
              AND CAST(strftime('%m', u.date_of_birth) AS INTEGER) = ?
              AND CAST(strftime('%d', u.date_of_birth) AS INTEGER) = ?
              AND NOT EXISTS (
                SELECT 1 FROM staff s WHERE s.user_id = u.id AND s.date_of_birth IS NOT NULL
              )
          `, [todayMonth, todayDay]);
        }
      }
    } catch (error) {
      // If column doesn't exist or query fails, just use empty array
      // This is expected since date_of_birth is typically in staff table, not users table
      console.log('Note: date_of_birth column not found in users table (expected)');
    }

    const allBirthdays = [
      ...staffWithBirthdays.map(s => ({
        user_id: s.user_id || s.user_id_from_users,
        name: s.name,
        email: s.email,
        role: s.role,
        date_of_birth: s.date_of_birth
      })),
      ...usersWithBirthdays.map(u => ({
        user_id: u.user_id,
        name: u.name,
        email: u.email,
        role: u.role,
        date_of_birth: u.date_of_birth
      }))
    ];

    // Remove duplicates
    const uniqueBirthdays = allBirthdays.filter((birthday, index, self) =>
      index === self.findIndex(b => b.user_id === birthday.user_id)
    );

    if (uniqueBirthdays.length === 0) {
      console.log('No birthdays today');
      return;
    }

    // Send notification to everyone in the system about each birthday
    for (const birthdayPerson of uniqueBirthdays) {
      // Get all users in the system
      const allUsers = await db.all('SELECT id FROM users WHERE id != ?', [birthdayPerson.user_id]);

      // Send notification to all users
      for (const user of allUsers) {
        try {
          await sendNotificationToUser(user.id, {
            title: '🎉 Birthday Celebration!',
            message: `Today is ${birthdayPerson.name}'s birthday! 🎂🎈`,
            link: '/calendar',
            type: 'info',
            senderId: birthdayPerson.user_id
          });
        } catch (error) {
          console.error(`Error sending birthday notification to user ${user.id}:`, error);
        }
      }

      // Also send a special notification to the birthday person
      try {
        await sendNotificationToUser(birthdayPerson.user_id, {
          title: '🎉 Happy Birthday!',
          message: `Happy Birthday ${birthdayPerson.name}! Wishing you a wonderful day! 🎂🎈🎁`,
          link: '/calendar',
          type: 'success',
          senderId: null // System notification
        });
      } catch (error) {
        console.error(`Error sending birthday notification to birthday person:`, error);
      }

      // Emit real-time socket event
      if (global.io) {
        global.io.emit('birthday_notification', {
          user_id: birthdayPerson.user_id,
          name: birthdayPerson.name,
          message: `Today is ${birthdayPerson.name}'s birthday! 🎂🎈`
        });
      }
    }

    console.log(`Sent birthday notifications for ${uniqueBirthdays.length} person(s)`);
    return uniqueBirthdays;
  } catch (error) {
    console.error('Error checking birthdays:', error);
    throw error;
  }
}

/**
 * Get all birthdays for a date range (for calendar display)
 */
async function getBirthdaysForDateRange(startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const birthdays = [];

    // Get staff birthdays
    const staffBirthdays = await db.all(`
      SELECT 
        s.id as staff_id,
        s.user_id,
        s.date_of_birth,
        u.name,
        u.email,
        u.role
      FROM staff s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.date_of_birth IS NOT NULL
    `);

    // Get user birthdays (for users without staff records)
    // Note: date_of_birth column may not exist in users table (it's in staff table)
    let userBirthdays = [];
    try {
      // Check if date_of_birth column exists in users table
      const USE_POSTGRESQL = !!process.env.DATABASE_URL;
      let columnExists = false;
      if (USE_POSTGRESQL) {
        const columnCheck = await db.get(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name = 'date_of_birth'
          AND table_schema = 'public'
        `);
        columnExists = !!columnCheck;
      } else {
        const tableInfo = await db.all("PRAGMA table_info(users)");
        columnExists = tableInfo.some(col => col.name === 'date_of_birth');
      }
      
      if (columnExists) {
        userBirthdays = await db.all(`
          SELECT 
            u.id as user_id,
            u.name,
            u.email,
            u.role,
            u.date_of_birth
          FROM users u
          WHERE u.date_of_birth IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM staff s WHERE s.user_id = u.id AND s.date_of_birth IS NOT NULL
            )
        `);
      }
    } catch (error) {
      // If column doesn't exist or query fails, just use empty array
      // This is expected since date_of_birth is typically in staff table, not users table
      console.log('Note: date_of_birth column not found in users table (expected)');
    }

    const allBirthdays = [
      ...staffBirthdays.map(s => ({
        user_id: s.user_id,
        name: s.name,
        email: s.email,
        role: s.role,
        date_of_birth: s.date_of_birth
      })),
      ...userBirthdays.map(u => ({
        user_id: u.user_id,
        name: u.name,
        email: u.email,
        role: u.role,
        date_of_birth: u.date_of_birth
      }))
    ];

    // Remove duplicates
    const uniqueBirthdays = allBirthdays.filter((birthday, index, self) =>
      index === self.findIndex(b => b.user_id === birthday.user_id)
    );

    // Filter birthdays that fall within the date range
    for (const birthday of uniqueBirthdays) {
      if (!birthday.date_of_birth) continue;

      const birthDate = new Date(birthday.date_of_birth);
      const birthMonth = birthDate.getMonth() + 1;
      const birthDay = birthDate.getDate();

      // Check each day in the range
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();

        if (currentMonth === birthMonth && currentDay === birthDay) {
          birthdays.push({
            id: `birthday_${birthday.user_id}_${currentDate.toISOString().split('T')[0]}`,
            title: `🎂 ${birthday.name}'s Birthday`,
            start: currentDate.toISOString().split('T')[0],
            end: currentDate.toISOString().split('T')[0],
            type: 'birthday',
            user_id: birthday.user_id,
            user_name: birthday.name,
            user_email: birthday.email,
            allDay: true,
            backgroundColor: '#ff6b9d',
            borderColor: '#ff6b9d',
            textColor: '#ffffff'
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return birthdays;
  } catch (error) {
    console.error('Error getting birthdays for date range:', error);
    throw error;
  }
}

module.exports = {
  checkAndSendBirthdayNotifications,
  getBirthdaysForDateRange
};

